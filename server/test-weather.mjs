import { getWeatherByCoords, getCacheStats } from "./src/services/weather.service.js";

let passed = 0, failed = 0;
function assert(label, condition) {
  if (condition) { console.log("  PASS: " + label); passed++; }
  else { console.error("  FAIL: " + label); failed++; }
}
console.log("=== Indulge WeatherService Tests ===");

console.log("T1: Invalid latitude");
var r1 = await getWeatherByCoords(999, 72.9781);
assert("available=false", r1.available === false);
assert("reason has latitude", !!(r1.reason && r1.reason.toLowerCase().includes("latitude")));

console.log("T2: Invalid longitude");
var r2 = await getWeatherByCoords(19.2183, 999);
assert("available=false", r2.available === false);
assert("reason has longitude", !!(r2.reason && r2.reason.toLowerCase().includes("longitude")));

console.log("T3: Non-numeric coords");
var r3 = await getWeatherByCoords("abc", "xyz");
assert("available=false", r3.available === false);

console.log("T4: Missing API key");
var saved = process.env.OPENWEATHER_API_KEY;
delete process.env.OPENWEATHER_API_KEY;
var r4 = await getWeatherByCoords(19.2183, 72.9781);
assert("available=false no key", r4.available === false);
assert("reason mentions key", !!(r4.reason && r4.reason.includes("OPENWEATHER_API_KEY")));
if (saved) process.env.OPENWEATHER_API_KEY = saved;

console.log("T5: Placeholder key");
process.env.OPENWEATHER_API_KEY = "YOUR_OPENWEATHER_API_KEY_HERE";
var r5 = await getWeatherByCoords(19.2183, 72.9781);
assert("available=false placeholder", r5.available === false);
assert("reason mentions configured", !!(r5.reason && r5.reason.toLowerCase().includes("configured")));
if (saved) process.env.OPENWEATHER_API_KEY = saved; else delete process.env.OPENWEATHER_API_KEY;

console.log("T6: Cache stats");
var stats = getCacheStats();
assert("has totalEntries", "totalEntries" in stats);
assert("has liveEntries", "liveEntries" in stats);
assert("ttlMs=300000", stats.ttlMs === 300000);
assert("timeoutMs=8000", stats.timeoutMs === 8000);
console.log("  Stats: " + JSON.stringify(stats));

console.log("T7: Unavailable shape");
var r7 = await getWeatherByCoords(999, 999);
assert("source=OpenWeather", r7.source === "OpenWeather");
assert("has fetchedAt", typeof r7.fetchedAt === "string");
assert("forecast=[]", Array.isArray(r7.forecast) && r7.forecast.length === 0);
assert("location=null", r7.location === null);
assert("current=null", r7.current === null);

var realKey = process.env.OPENWEATHER_API_KEY;
var keyIsReal = realKey && realKey !== "YOUR_OPENWEATHER_API_KEY_HERE" && realKey.trim().length > 10;
if (keyIsReal) {
  console.log("T8: LIVE Thane");
  var r8 = await getWeatherByCoords(19.2183, 72.9781);
  assert("available=true", r8.available === true);
  assert("has temperature", r8.current?.temperature != null);
  assert("key not in response", !JSON.stringify(r8).includes(realKey));
  assert("cached=false", r8.cached === false);
  console.log("  Loc: " + r8.location?.name + " Temp: " + r8.current?.temperature + "C " + r8.current?.weatherDescription);
  console.log("  Forecast slots: " + r8.forecast?.length);
  console.log("T9: LIVE Mumbai");
  var r9 = await getWeatherByCoords(19.076, 72.8777);
  assert("available=true Mumbai", r9.available === true);
  assert("key not in Mumbai response", !JSON.stringify(r9).includes(realKey));
  console.log("  Loc: " + r9.location?.name + " Temp: " + r9.current?.temperature + "C");
  console.log("T10: Cache hit Thane");
  var r10 = await getWeatherByCoords(19.2183, 72.9781);
  assert("cached=true repeat", r10.cached === true);
  var s2 = getCacheStats();
  assert("cache liveEntries>0", s2.liveEntries > 0);
  console.log("  Cache: " + JSON.stringify(s2));
} else {
  console.log("T8-10: SKIPPED - set OPENWEATHER_API_KEY in server/.env for live tests");
}

console.log("=== RESULTS: " + passed + " passed, " + failed + " failed ===");
if (failed > 0) process.exit(1);
