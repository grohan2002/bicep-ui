// ---------------------------------------------------------------------------
// GET /api/check-key — checks whether the server has an Anthropic API key
// configured via environment variable. Returns { hasKey: boolean }.
// ---------------------------------------------------------------------------

export async function GET() {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  return Response.json({ hasKey });
}
