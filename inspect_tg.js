import fetch from "node-fetch";

async function inspectHtml() {
  const url = "https://t.me/durov/254?embed=1";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const html = await res.text();
  console.log("HTML length:", html.length);

  // find photo elements
  const photoWraps = html.match(/<a[^>]+class="[^"]*tgme_widget_message_photo_wrap[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
  console.log("Photo wrap tags:", photoWraps);

  const allA = html.match(/<a[^>]+>/gi);
  console.log("All <a> tags:", allA?.filter(a => a.includes("photo") || a.includes("telesco") || a.includes("cdn")));
}

inspectHtml();
