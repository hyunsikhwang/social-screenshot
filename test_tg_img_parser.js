import fetch from "node-fetch";

async function parseTgImages(urlStr) {
  const match = urlStr.match(/(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([a-zA-Z0-9_]+)\/(\d+)/i);
  if (!match) throw new Error("Invalid TG URL");

  const channel = match[1];
  const postId = match[2];
  const embedUrl = `https://t.me/${channel}/${postId}?embed=1`;

  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await res.text();

  // 1. Extract Post Text
  let text = "";
  const textMatch = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (textMatch) {
    text = textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  }

  // 2. Extract Author
  let authorName = channel;
  const authorMatch = html.match(/<div class="tgme_widget_message_author_name"[^>]*>([\s\S]*?)<\/div>/i) ||
                      html.match(/<span class="tgme_widget_message_owner_name"[^>]*>([\s\S]*?)<\/span>/i);
  if (authorMatch) {
    authorName = authorMatch[1].replace(/<[^>]+>/g, "").trim() || channel;
  }

  let authorAvatar = "";
  const avatarImgMatch = html.match(/<img class="tgme_widget_message_user_photo"[^>]+src=["']([^"']+)["']/i);
  const avatarStyleMatch = html.match(/class="tgme_widget_message_user_photo[^"]*"[^>]*style=["'][^"']*background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/i);
  if (avatarImgMatch) {
    authorAvatar = avatarImgMatch[1];
  } else if (avatarStyleMatch) {
    authorAvatar = avatarStyleMatch[1];
  }

  // 3. Extract Images
  // We want to find photo wrap background images and link preview images
  const imageUrls = [];

  // Match all background-image urls
  const bgMatches = [...html.matchAll(/background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi)];
  for (const m of bgMatches) {
    let imgUrl = m[1];
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    
    // Ignore emojis and avatars
    if (imgUrl.includes("/emoji/") || imgUrl.includes("user_photo") || imgUrl.includes("icon-")) continue;

    if (!imageUrls.includes(imgUrl)) {
      imageUrls.push(imgUrl);
    }
  }

  console.log(`Post https://t.me/${channel}/${postId}:`);
  console.log("Author:", authorName, authorAvatar ? "(Avatar found)" : "");
  console.log("Text:", text);
  console.log("Found Images:", imageUrls);
  return { channel, postId, text, authorName, authorAvatar, imageUrls };
}

async function testAll() {
  await parseTgImages("https://t.me/telegram/200");
  await parseTgImages("https://t.me/telegram/201");
  await parseTgImages("https://t.me/telegram/220");
}

testAll();
