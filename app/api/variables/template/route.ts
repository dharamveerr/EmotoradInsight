import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Generate CSV template
  const csvContent = `name,type,description
@customer_name,string,Name of the customer
@customer_email,string,Email address of customer
@product_type,string,Type of product selected
@product_id,string,ID of the product
@price_range,string,Price range selected by customer
@city,string,City/location of customer
@discount_applied,number,Discount percentage applied
@purchase_amount,number,Total purchase amount
@device_type,string,Device used (mobile/web/tablet)
@referral_source,string,How customer found us (google/social/direct)`;

  // Return as downloadable file
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="variables-template.csv"',
    },
  });
}
