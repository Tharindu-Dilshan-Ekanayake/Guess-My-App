/**
 * Builds shared/apps.json: the app catalogue both the game server and the client read.
 *
 *   node scripts/build-apps.mjs        (from client/)
 *
 * Logos come from simple-icons (CC0: one 24x24 SVG path + brand colour per brand),
 * drawn by the game as a rounded "app icon". simple-icons is a devDependency only:
 * the bundle ships just the paths listed here, never the whole package (~20 MB).
 *
 * Each entry: [simple-icons slug, display name, tier, options]
 *   tier 1 = owned by everyone from the start, 2 = common, 3 = rare, 4 = epic.
 *   options.light  white tile, logo in the brand colour (Google-style icons)
 *   options.bg     tile colour override
 *   options.new    shows a "NEW!" badge in the App Store
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as icons from 'simple-icons'

const PRICE = { 1: 0, 2: 150, 3: 400, 4: 900 }

const CATALOG = [
  // ---- Tier 1: everyone owns these -------------------------------------------------
  ['youtube', 'YouTube', 1],
  ['tiktok', 'TikTok', 1],
  ['instagram', 'Instagram', 1],
  ['whatsapp', 'WhatsApp', 1],
  ['spotify', 'Spotify', 1],
  ['netflix', 'Netflix', 1],
  ['google', 'Google', 1, { light: true }],
  ['snapchat', 'Snapchat', 1],
  ['discord', 'Discord', 1],
  ['roblox', 'Roblox', 1],
  ['x', 'X', 1],
  ['facebook', 'Facebook', 1],

  // ---- Tier 2: common ---------------------------------------------------------------
  ['reddit', 'Reddit', 2],
  ['pinterest', 'Pinterest', 2],
  ['telegram', 'Telegram', 2],
  ['twitch', 'Twitch', 2],
  ['uber', 'Uber', 2],
  ['duolingo', 'Duolingo', 2],
  ['paypal', 'PayPal', 2],
  ['cashapp', 'Cash App', 2],
  ['canva', 'Canva', 2],
  ['zoom', 'Zoom', 2],
  ['gmail', 'Gmail', 2, { light: true }],
  ['googlemaps', 'Google Maps', 2, { light: true }],
  ['googlechrome', 'Chrome', 2, { light: true }],
  ['googleplay', 'Google Play', 2, { light: true }],
  ['googledrive', 'Google Drive', 2, { light: true }],
  ['googlephotos', 'Google Photos', 2, { light: true }],
  ['applemusic', 'Apple Music', 2],
  ['appstore', 'App Store', 2],
  ['apple', 'Apple', 2],
  ['icloud', 'iCloud', 2],
  ['amazon', 'Amazon', 2],
  ['primevideo', 'Prime Video', 2],
  ['messenger', 'Messenger', 2],
  ['threads', 'Threads', 2, { new: true }],
  ['linkedin', 'LinkedIn', 2],
  ['steam', 'Steam', 2],
  ['epicgames', 'Epic Games', 2],
  ['playstation', 'PlayStation', 2],
  ['nintendoswitch', 'Switch', 2],
  ['pokemon', 'Pokémon', 2],
  ['airbnb', 'Airbnb', 2],
  ['ebay', 'eBay', 2],
  ['mcdonalds', "McDonald's", 2],
  ['starbucks', 'Starbucks', 2],
  ['kfc', 'KFC', 2],
  ['burgerking', 'Burger King', 2],
  ['ubereats', 'Uber Eats', 2],
  ['doordash', 'DoorDash', 2],
  ['imdb', 'IMDb', 2],
  ['crunchyroll', 'Crunchyroll', 2],
  ['wikipedia', 'Wikipedia', 2, { light: true }],
  ['firefoxbrowser', 'Firefox', 2],

  // ---- Tier 3: rare -----------------------------------------------------------------
  ['signal', 'Signal', 3],
  ['wechat', 'WeChat', 3],
  ['line', 'LINE', 3],
  ['viber', 'Viber', 3],
  ['kakaotalk', 'KakaoTalk', 3],
  ['slack', 'Slack', 3],
  ['notion', 'Notion', 3],
  ['trello', 'Trello', 3],
  ['figma', 'Figma', 3],
  ['github', 'GitHub', 3],
  ['dropbox', 'Dropbox', 3],
  ['soundcloud', 'SoundCloud', 3],
  ['shazam', 'Shazam', 3],
  ['tidal', 'TIDAL', 3],
  ['audible', 'Audible', 3],
  ['vimeo', 'Vimeo', 3],
  ['tumblr', 'Tumblr', 3],
  ['quora', 'Quora', 3],
  ['medium', 'Medium', 3],
  ['opera', 'Opera', 3],
  ['brave', 'Brave', 3],
  ['duckduckgo', 'DuckDuckGo', 3],
  ['vlcmediaplayer', 'VLC', 3],
  ['tinder', 'Tinder', 3],
  ['revolut', 'Revolut', 3],
  ['venmo', 'Venmo', 3],
  ['wise', 'Wise', 3],
  ['binance', 'Binance', 3],
  ['coinbase', 'Coinbase', 3],
  ['waze', 'Waze', 3],
  ['strava', 'Strava', 3],
  ['lyft', 'Lyft', 3],
  ['grab', 'Grab', 3],
  ['tripadvisor', 'Tripadvisor', 3],
  ['aliexpress', 'AliExpress', 3],
  ['shopee', 'Shopee', 3],
  ['etsy', 'Etsy', 3],
  ['walmart', 'Walmart', 3],
  ['ikea', 'IKEA', 3],
  ['zara', 'Zara', 3],
  ['nike', 'Nike', 3],
  ['adidas', 'adidas', 3],
  ['samsung', 'Samsung', 3],
  ['xiaomi', 'Xiaomi', 3],
  ['huawei', 'Huawei', 3],
  ['nvidia', 'NVIDIA', 3],
  ['riotgames', 'Riot Games', 3],
  ['leagueoflegends', 'League of Legends', 3],
  ['valorant', 'VALORANT', 3],
  ['pubg', 'PUBG', 3],
  ['battledotnet', 'Battle.net', 3],
  ['ubisoft', 'Ubisoft', 3],
  ['ea', 'EA', 3],
  ['rockstargames', 'Rockstar Games', 3],
  ['chessdotcom', 'Chess.com', 3],
  ['kick', 'Kick', 3],
  ['bilibili', 'bilibili', 3],
  ['vk', 'VK', 3],
  ['naver', 'NAVER', 3],
  ['letterboxd', 'Letterboxd', 3],
  ['zomato', 'Zomato', 3],
  ['swiggy', 'Swiggy', 3],
  ['instacart', 'Instacart', 3],
  ['tacobell', 'Taco Bell', 3],
  ['unity', 'Unity', 3],
  ['blender', 'Blender', 3],

  // ---- Tier 4: epic -----------------------------------------------------------------
  ['openai', 'ChatGPT', 4, { bg: '#000000', new: true }],
  ['claude', 'Claude', 4, { new: true }],
  ['googlegemini', 'Gemini', 4, { light: true, new: true }],
  ['perplexity', 'Perplexity', 4, { new: true }],
  ['bereal', 'BeReal', 4, { new: true }],
  ['googlemeet', 'Google Meet', 4, { light: true }],
  ['lichess', 'Lichess', 4],
  ['picsart', 'Picsart', 4],
  ['vsco', 'VSCO', 4],
  ['wattpad', 'Wattpad', 4],
  ['goodreads', 'Goodreads', 4],
  ['myanimelist', 'MyAnimeList', 4],
  ['obsidian', 'Obsidian', 4],
  ['todoist', 'Todoist', 4],
  ['evernote', 'Evernote', 4],
  ['mega', 'MEGA', 4],
  ['safari', 'Safari', 4],
  ['trivago', 'trivago', 4],
  ['expedia', 'Expedia', 4],
  ['itchdotio', 'itch.io', 4],
  ['godotengine', 'Godot', 4],
  ['unrealengine', 'Unreal Engine', 4],
  ['sega', 'SEGA', 4],
  ['konami', 'Konami', 4],
  ['squareenix', 'Square Enix', 4],
  ['activision', 'Activision', 4],
  ['alibabadotcom', 'Alibaba', 4],
  ['target', 'Target', 4],
  ['wish', 'Wish', 4],
]

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

const exportName = (slug) => `si${slug[0].toUpperCase()}${slug.slice(1)}`

/**
 * More apps, tier by tier: just simple-icons slugs. The display name is the brand's
 * simple-icons title unless NAMES overrides it. Google apps use the light style.
 */
const MORE = {
  2: `youtubemusic youtubeshorts youtubekids googledocs googlesheets googleslides googleforms googlecalendar
    googlekeep googletranslate googlelens googlehome googlepay googlenews googleclassroom googleearth
    googleassistant googlemessages android appletv applepodcasts applepay applenews applearcade meta bluesky
    mastodon flickr yelp patreon kahoot quizlet khanacademy grammarly shopify flipkart deliveroo justeat
    foodpanda grubhub nba fifa premierleague wwe ufc dailymotion rumble plex tubi emirates headspace fitbit
    garmin indeed fiverr upwork zillow cnn newyorktimes imgur giphy 9gag nordvpn expressvpn 1password
    adobeacrobatreader githubcopilot scratch operagx tesla oneplus samsungpay paytm phonepe alipay klarna
    americanexpress robinhood udemy coursera`,
  3: `clubhouse kik badoo meetup nextdoor deviantart behance dribbble artstation foursquare sinaweibo
    xiaohongshu substack kofi buymeacoffee linktree gofundme zalo tencentqq pocketcasts castbox iheartradio
    tunein audiomack bandcamp lastdotfm napster genius youtubestudio kodi mubi dazn odysee itunes humblebundle
    nintendo counterstrike dota2 edx wolfram ticktick asana clickup airtable miro sketch framer
    adobecreativecloud adobeillustrator davinciresolve obsstudio streamlabs webex googlefit googleauthenticator
    googleanalytics chromecast bitwarden lastpass dashlane protonvpn protonmail surfshark torbrowser vivaldi
    ecosia qwant baidu mercadopago rakuten zalando uniqlo puma newbalance underarmour reebok stockx bukalapak
    taobao postmates ifood gojek qatarairways turkishairlines ryanair easyjet singaporeairlines britishairways
    lufthansa delta americanairlines unitedairlines klm airfrance aircanada here openstreetmap zelle n26 monzo
    afterpay stripe square okx kucoin huggingface poe gitlab stackoverflow xcode replit leetcode oppo vivo
    motorola nokia razer peloton glassdoor freelancer theguardian flipboard feedly pocket ccleaner avast
    kaspersky malwarebytes norton mcafee unsplash pexels pixabay box wetransfer nextcloud zoho calendly arc 500px`,
  4: `element threema wire mattermost teamspeak guilded overcast joplin logseq roamresearch`,
}
const NAMES = {
  sinaweibo: 'Weibo',
  xiaohongshu: 'RedNote',
  tencentqq: 'QQ',
  adobeacrobatreader: 'Acrobat',
  adobecreativecloud: 'Creative Cloud',
  adobeillustrator: 'Illustrator',
  googleauthenticator: 'Authenticator',
  newyorktimes: 'NYTimes',
  githubcopilot: 'Copilot',
  americanexpress: 'Amex',
  buymeacoffee: 'Buy Me a Coffee',
  turkishairlines: 'Turkish Airlines',
  davinciresolve: 'DaVinci Resolve',
}
const NEW_APPS = new Set(['bluesky', 'githubcopilot', 'meta', 'xiaohongshu', 'arc', 'poe', 'youtubeshorts'])
for (const [tier, list] of Object.entries(MORE)) {
  for (const slug of list.split(/\s+/).filter(Boolean)) {
    const opts = {}
    if (slug.startsWith('google')) opts.light = true
    if (NEW_APPS.has(slug)) opts.new = true
    CATALOG.push([slug, NAMES[slug] ?? null, Number(tier), opts])
  }
}

const seen = new Set()
const apps = []
const missing = []
for (const [slug, title, tier, opts = {}] of CATALOG) {
  if (seen.has(slug)) throw new Error(`duplicate app ${slug}`)
  seen.add(slug)
  const icon = icons[exportName(slug)]
  if (!icon) {
    missing.push(slug)
    continue
  }
  const name = title ?? icon.title
  const brand = `#${icon.hex}`
  let bg = opts.bg || (opts.light ? '#ffffff' : brand)
  let fg = opts.light ? brand : luminance(bg) > 0.55 ? '#111111' : '#ffffff'
  // A white logo on a white tile (or the reverse) would be invisible.
  if (opts.light && luminance(brand) > 0.8) fg = '#111111'
  if (!opts.light && Math.abs(luminance(bg) - luminance(fg)) < 0.2) bg = '#1d2433'
  apps.push({
    id: slug,
    name,
    tier,
    price: PRICE[tier],
    bg,
    fg,
    path: icon.path,
    ...(opts.new ? { new: true } : {}),
  })
}

if (missing.length) {
  console.error(`Missing from simple-icons: ${missing.join(', ')}`)
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../../shared/apps.json')
const json = JSON.stringify(apps)
writeFileSync(out, `${json}\n`)
const byTier = [1, 2, 3, 4].map((t) => apps.filter((a) => a.tier === t).length)
console.log(`Wrote ${apps.length} apps (tiers 1-4: ${byTier.join('/')}) to ${out}: ${(json.length / 1024).toFixed(1)} KB`)
