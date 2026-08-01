import fetch from "node-fetch";

async function dumpTags() {
  const url = "https://t.me/durov/254?embed=1";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const html = await res.text();

  // Print lines containing telesco.pe or photo or background
  const lines = html.split("\n");
  for (const line of lines) {
    if (line.includes("telesco") || line.includes("photo") || line.includes("background-image")) {
      console.log("LINE:", line.trim().substring(0, 300));
    }
  }
}

dumpTags();
