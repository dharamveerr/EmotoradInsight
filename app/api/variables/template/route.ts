import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Generate CSV template
  const csvContent = `name,description
@customer_name,Name of the customer
@customer_email,Email address of customer
@product_type,Type of product selected
@product_id,ID of the product
@price_range,Price range selected by customer
@city,City/location of customer
@discount_applied,Discount percentage applied
@purchase_amount,Total purchase amount
@device_type,Device used (mobile/web/tablet)
@referral_source,How customer found us (google/social/direct)`;

  // Return as downloadable file
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="variables-template.csv"',
    },
  });
}
