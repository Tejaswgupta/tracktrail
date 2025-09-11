const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function analyzeBogusITC(
  gstin: string,
  files: { gstr1: File; gstr2: File; gstr3b: File }
) {
  const body = new FormData();
  body.append("gstin", gstin);
  body.append("gstr1", files.gstr1);
  body.append("gstr2", files.gstr2);
  body.append("gstr3b", files.gstr3b);

  const res = await fetch(`${BACKEND_URL}/api/v1/bogus-itc/analyze`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}