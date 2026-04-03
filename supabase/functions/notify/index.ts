import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Get settings
  const { data: settings } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["resend_api_key", "notification_email", "notification_from", "site_url"])

  const config: Record<string, string> = {}
  for (const row of settings || []) {
    config[row.key] = row.value
  }

  const resendKey = config.resend_api_key
  const recipient = config.notification_email
  const sender = config.notification_from || "HuurRadar <onboarding@resend.dev>"
  const siteUrl = config.site_url || ""

  if (!resendKey || !recipient) {
    return new Response(
      JSON.stringify({ success: false, reason: "resend_api_key or notification_email not configured" }),
      { headers: { "Content-Type": "application/json" } },
    )
  }

  // Get new listings from last 24 hours
  const { data: listings, count } = await supabase
    .from("listings")
    .select("title, city, price_monthly, surface_m2, rooms, source_url, images", { count: "exact" })
    .gt("first_seen_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .eq("status", "active")
    .order("price_monthly", { ascending: true })
    .limit(20)

  const listingCount = count || 0

  if (listingCount === 0) {
    return new Response(
      JSON.stringify({ success: true, reason: "No new listings in last 24 hours" }),
      { headers: { "Content-Type": "application/json" } },
    )
  }

  // Build HTML email
  let html = `
    <html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 16px;">
    <h2 style="color: #1a1a1a;">🏠 HuurRadar: ${listingCount} nieuwe woning(en)</h2>
    <p style="color: #666;">De afgelopen 24 uur gevonden:</p>
    <table style="width: 100%; border-collapse: collapse;">
  `

  for (const listing of listings || []) {
    const price = `€${Math.round(listing.price_monthly / 100)}`
    const details: string[] = [listing.city]
    if (listing.surface_m2) details.push(`${listing.surface_m2} m²`)
    if (listing.rooms) details.push(`${listing.rooms} kamers`)

    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;">
    `

    if (listing.images?.length) {
      html += `<img src="${listing.images[0]}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;float:left;margin-right:12px;" />`
    }

    html += `
          <strong><a href="${listing.source_url}" style="color: #2563eb; text-decoration: none;">${listing.title}</a></strong><br/>
          <span style="color: #666; font-size: 14px;">${details.join(" · ")}</span><br/>
          <strong style="color: #16a34a;">${price} /mnd</strong>
        </td>
      </tr>
    `
  }

  html += `</table>`

  if (listingCount > 20) {
    html += `<p style="color: #666;">... en ${listingCount - 20} meer. <a href="${siteUrl}/woningen">Bekijk alles</a></p>`
  }

  html += `
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #999; font-size: 12px;">HuurRadar — automatische huurwoning alerts</p>
    </body></html>
  `

  // Send via Resend
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to: recipient,
      subject: `🏠 ${listingCount} nieuwe huurwoning(en) gevonden`,
      html,
    }),
  })

  if (!emailResponse.ok) {
    const error = await emailResponse.text()
    console.error("[notify] Resend error:", error)
    return new Response(
      JSON.stringify({ success: false, error }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }

  const result = await emailResponse.json()
  console.log(`[notify] Email sent to ${recipient}: ${listingCount} listings`)

  return new Response(
    JSON.stringify({ success: true, listingCount, emailId: result.id }),
    { headers: { "Content-Type": "application/json" } },
  )
})
