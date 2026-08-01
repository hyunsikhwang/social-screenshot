import fetch from "node-fetch";

async function testImages() {
  const posts = [
    { channel: "telegram", id: 200 },
    { channel: "durov", id: 254 },
    { channel: "telegram", id: 219 },
    { channel: "telegram", id: 221 },
  ];

  for (const { channel, id } of posts) {
    const embedUrl = `https://t.me/${channel}/${id}?embed=1`;
    console.log(`\n=== Testing Embed: ${embedUrl} ===`);
    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      const html = await res.text();
      
      // Match photo wraps
      const photoMatches = [...html.matchAll(/tgme_widget_message_photo_wrap[^>]*style=["'][^"']*background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi)];
      console.log("Photo wrap matches:", photoMatches.map(m => m[1]));

      const bgMatches = [...html.matchAll(/background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi)];
      console.log("All bg matches:", bgMatches.map(m => m[1]));

      const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
      console.log("Img matches:", imgMatches.map(m => m[1]));

    } catch (e) {
      console.error("Error:", e);
    }
  }
}

testImages();
