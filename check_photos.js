import fetch from "node-fetch";

async function checkPhotoPosts() {
  const posts = [
    "https://t.me/telegram/200?embed=1",
    "https://t.me/telegram/201?embed=1",
    "https://t.me/telegram/220?embed=1",
    "https://t.me/durov/251?embed=1",
  ];

  for (const url of posts) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const html = await res.text();
    console.log(`\nURL: ${url}`);
    
    // photo wraps
    const photoWraps = html.match(/class="[^"]*tgme_widget_message_photo_wrap[^"]*"[^>]*style=["'][^"']*background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi) ||
                       html.match(/tgme_widget_message_photo_wrap[^>]*href=["']([^"']+)["']/gi) ||
                       html.match(/background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi);
    
    console.log("Found background images / photos:", photoWraps?.slice(0, 5));
  }
}

checkPhotoPosts();
