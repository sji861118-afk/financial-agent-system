import { type NextRequest } from "next/server";
import { generateAppraisalExcel } from "@/lib/appraisal-excel";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const buffer = await generateAppraisalExcel(data);
    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="appraisal_${Date.now()}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
