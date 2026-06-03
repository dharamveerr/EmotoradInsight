#!/usr/bin/env python3
import sqlite3
import pandas as pd
import json
from uuid import uuid4
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "insights.db"
XLSX_PATHS = [
    Path(__file__).parent.parent / "data" / "source" / "data_apr30_may16.xlsx",  # Apr 30 – May 16
    Path(__file__).parent.parent / "data" / "source" / "data_may16_may31.xlsx",  # May 16 – May 31
]

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")
cursor = conn.cursor()

cursor.execute("""
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    journey TEXT NOT NULL,
    step TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata TEXT
  )
""")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_journey ON events(journey)")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_journey ON events(userId, journey)")

# Clear old seeded data
cursor.execute("DELETE FROM events")
print("Cleared old events.")

print("Merging both xlsx files...")
frames = []
for path in XLSX_PATHS:
    print(f"  Reading {path.name}...")
    frames.append(pd.read_excel(path))
df = pd.concat(frames, ignore_index=True)
print(f"  Total rows after merge: {len(df)} | Unique phones: {df['Phone Number'].nunique()}")

# Columns to always capture as metadata (user identity + journey variables)
IDENTITY_COLS = ['@user_name', '@customer_name', '@campaign_id', '@prospectId', '@first_message']

JOURNEY_VAR_MAP = {
    'explore_products': ['@product', '@price', '@min_price', '@max_price', '@carousel_choosen',
                          '@url1', '@url2', '@url3', '@flow_token', '@agent_take_over'],
    'register_warranty': ['@frame_number', '@frameNumber', '@warrantyStatus', '@message',
                           '@purchase_date', '@flow_token', '@agent_take_over', '@contact_number'],
    'customer_support': ['@support', '@contact', '@contact_number', '@customer_name',
                          '@customer_email_id', '@issue', '@model_name', '@km_driven',
                          '@address', '@generatedTicketNumber', '@flow_token', '@agent_take_over'],
    'track_order': ['@order_id', '@orderStatus', '@customerName', '@productName',
                     '@docketNumber', '@flow_token', '@agent_take_over', '@contact_number'],
    'find_shop': ['@address', '@dealer_phone_number', '@dealership_name', '@google_maps_link', '@flow_token', '@agent_take_over'],
}

def get_meta(row, journey, extra_cols=None):
    """Build metadata dict from row for given journey."""
    cols = IDENTITY_COLS + JOURNEY_VAR_MAP.get(journey, [])
    if extra_cols:
        cols += extra_cols
    meta = {}
    for col in cols:
        val = row.get(col)
        if pd.notna(val) if not isinstance(val, str) else bool(val.strip()):
            meta[col] = str(val).strip()
    return meta

events = []

for idx, row in df.iterrows():
    # Use Phone Number as userId — primary identifier
    phone = str(row.get('Phone Number', '')).strip()
    if not phone or phone == 'nan':
        phone = f"unknown_{idx:04d}"
    user_id = phone

    ts_str = str(row['@time_stamp'])
    try:
        ts = pd.to_datetime(ts_str, errors='coerce')
        if pd.isna(ts):
            continue
        timestamp = ts.isoformat()
    except:
        continue

    main_menu = str(row.get('@main_menu', '')).strip()

    if main_menu == 'Explore EM Products':
        journey = 'explore_products'
        base_meta = get_meta(row, journey)

        # Step 1: entered journey
        events.append((str(uuid4()), user_id, journey, "Explore EM Products",
                        timestamp, json.dumps({**base_meta, '@main_menu': main_menu})))

        # Step 2: product selected
        if pd.notna(row.get('@product')):
            events.append((str(uuid4()), user_id, journey, "Product Selected",
                            timestamp, json.dumps({**base_meta, '@product': str(row['@product'])})))

        # Step 3: price filter set
        if pd.notna(row.get('@price')):
            price_meta = {**base_meta,
                          '@price': str(row['@price']),
                          '@carousel_choosen': str(row.get('@carousel_choosen', '')),
                          '@min_price': str(row.get('@min_price', '')),
                          '@max_price': str(row.get('@max_price', ''))}
            events.append((str(uuid4()), user_id, journey, "Price Filter Set",
                            timestamp, json.dumps(price_meta)))

    elif main_menu == 'Register Warranty':
        journey = 'register_warranty'
        base_meta = get_meta(row, journey)

        events.append((str(uuid4()), user_id, journey, "Register Warranty",
                        timestamp, json.dumps({**base_meta, '@main_menu': main_menu})))

        frame = row.get('@frame_number') or row.get('@frameNumber')
        if pd.notna(frame) if frame is not None else False:
            events.append((str(uuid4()), user_id, journey, "Frame Number Entered",
                            timestamp, json.dumps({**base_meta, '@frame_number': str(frame)})))

            if pd.notna(row.get('@warrantyStatus')):
                status = str(row['@warrantyStatus'])
                msg = str(row.get('@message', ''))
                events.append((str(uuid4()), user_id, journey, "Warranty Checked",
                                timestamp, json.dumps({**base_meta, '@warrantyStatus': status, '@message': msg})))

                if str(row.get('@warrantyStatus', '')) == '200.0':
                    events.append((str(uuid4()), user_id, journey, "Warranty Registered",
                                    timestamp, json.dumps({**base_meta, '@warrantyStatus': '200'})))
        else:
            events.append((str(uuid4()), user_id, journey, "Frame Number Entered",
                            timestamp, json.dumps(base_meta)))

    elif main_menu in ['Contact Customer Support', 'Customer Support']:
        journey = 'customer_support'
        base_meta = get_meta(row, journey)

        events.append((str(uuid4()), user_id, journey, "Contact Customer Support",
                        timestamp, json.dumps({**base_meta, '@main_menu': main_menu})))

        if pd.notna(row.get('@support')):
            events.append((str(uuid4()), user_id, journey, "Issue Type Selected",
                            timestamp, json.dumps({**base_meta, '@support': str(row['@support']),
                                                   '@contact': str(row.get('@contact', ''))})))

            if pd.notna(row.get('@issue')):
                events.append((str(uuid4()), user_id, journey, "Issue Details Provided",
                                timestamp, json.dumps({**base_meta,
                                    '@issue': str(row['@issue']),
                                    '@model_name': str(row.get('@model_name', '')),
                                    '@km_driven': str(row.get('@km_driven', '')),
                                    '@customer_email_id': str(row.get('@customer_email_id', '')),
                                    '@address': str(row.get('@address', ''))})))

                if pd.notna(row.get('@generatedTicketNumber')):
                    events.append((str(uuid4()), user_id, journey, "Ticket Created",
                                    timestamp, json.dumps({**base_meta,
                                        '@generatedTicketNumber': str(row['@generatedTicketNumber']),
                                        '@flow_token': str(row.get('@flow_token', ''))})))
            else:
                events.append((str(uuid4()), user_id, journey, "Issue Details Provided",
                                timestamp, json.dumps(base_meta)))
        else:
            events.append((str(uuid4()), user_id, journey, "Issue Type Selected",
                            timestamp, json.dumps(base_meta)))

    elif main_menu == 'Track Your Order':
        journey = 'track_order'
        base_meta = get_meta(row, journey)

        events.append((str(uuid4()), user_id, journey, "Track Your Order",
                        timestamp, json.dumps({**base_meta, '@main_menu': main_menu})))

        if pd.notna(row.get('@order_id')):
            events.append((str(uuid4()), user_id, journey, "Order ID Entered",
                            timestamp, json.dumps({**base_meta, '@order_id': str(row['@order_id'])})))

            if pd.notna(row.get('@productName')):
                events.append((str(uuid4()), user_id, journey, "Order Found",
                                timestamp, json.dumps({**base_meta,
                                    '@productName': str(row['@productName']),
                                    '@customerName': str(row.get('@customerName', '')),
                                    '@docketNumber': str(row.get('@docketNumber', ''))})))

                if pd.notna(row.get('@orderStatus')):
                    events.append((str(uuid4()), user_id, journey, "Order Status Viewed",
                                    timestamp, json.dumps({**base_meta,
                                        '@orderStatus': str(row['@orderStatus'])})))
            else:
                events.append((str(uuid4()), user_id, journey, "Order Found",
                                timestamp, json.dumps(base_meta)))
        else:
            events.append((str(uuid4()), user_id, journey, "Order ID Entered",
                            timestamp, json.dumps(base_meta)))

    elif main_menu == 'Find Shop/Service Centre':
        journey = 'find_shop'
        base_meta = get_meta(row, journey)

        events.append((str(uuid4()), user_id, journey, "Find Shop/Service Centre",
                        timestamp, json.dumps({**base_meta, '@main_menu': main_menu})))
        events.append((str(uuid4()), user_id, journey, "Location Entered",
                        timestamp, json.dumps({**base_meta, '@address': str(row.get('@address', ''))})))
        events.append((str(uuid4()), user_id, journey, "Shops Displayed",
                        timestamp, json.dumps(base_meta)))

cursor.executemany(
    "INSERT OR IGNORE INTO events (id, userId, journey, step, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)",
    events
)
conn.commit()
conn.close()

print(f"Seeded {len(events)} events into {DB_PATH}")
print(f"Using Phone Number as userId.")
