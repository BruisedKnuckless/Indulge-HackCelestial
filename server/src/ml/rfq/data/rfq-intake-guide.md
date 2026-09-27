# Indulge RFQ intake: domain guide

Indulge is a B2B marketplace where Indian hospitality businesses (hotels, banquet
venues, caterers, event companies) rent idle resources from each other. A seeker
describes what they need in one message; the intake model turns it into the
fields of a Request for Quotation (RFQ).

## Output contract

Reply with one JSON object with exactly these keys: category, title, quantity, unit, minCapacity, budget, city, dateText, startTime, endTime, urgency, notes.
Use null for anything the request does not state. Never invent a value.

- category: the category of the FIRST thing asked for. A second item mentioned
  later ("+ PA system", "and 2 waiters") goes into notes, not the category.
- quantity: how many of the first item. For kitchens it is the number of hours.
  "a banquet hall" or "one tandoor" is 1.
- unit: "unit" by default, "hour" for kitchen time, "slot" for parking.
- minCapacity: only for venues (guests, pax, people) and vehicles (7 seater).
  "250 chairs for 300 guests" has no minCapacity.
- budget: rupees as a plain number.
- city: the canonical city name from the list below.
- dateText: the date words copied exactly as written. Never compute a date.
- startTime / endTime: 24-hour HH:MM. "6pm-11pm" is 18:00 and 23:00; an event can
  end after midnight ("8pm till 3am" ends at 03:00).
- urgency: high, medium or low.

## Categories

- **banquet_space**: banquet hall, party hall, conference room, ballroom, lawn, rooftop venue, terrace, board room, marriage hall, function hall, auditorium. Also: venue, hall, banquet, mandap, space for. A guest or seat count here is minCapacity.
- **parking**: parking slot, parking space, car parking, parking bay, two-wheeler parking. Also: parking, park cars. Quantity counts parking slots (unit "slot").
- **vehicle**: Innova, Innova Crysta, tempo traveller, mini bus, coach, sedan, Ertiga, luxury car, vintage car, refrigerated van. Also: cab, car, bus, van, vehicle, transport, pickup and drop. A guest or seat count here is minCapacity.
- **kitchen_capacity**: commercial kitchen, kitchen slot, tandoor, prep kitchen, bakery oven, cloud kitchen. Also: kitchen, cooking space, bulk cooking. Quantity counts hours.
- **furniture**: banquet chair, chiavari chair, folding chair, round table, cocktail table, sofa set, lounge set, buffet counter, stage platform, podium. Also: chairs, tables, furniture, seating.
- **av_equipment**: PA system, projector, LED wall, sound system, DJ console, wireless mic, stage light, line array speaker, projection screen. Also: speaker, speakers, mic, audio, lighting, av setup, screen.
- **staff**: waiter, chef, valet driver, bartender, housekeeping staff, security guard, event crew member, usher, cook. Also: staff, manpower, crew, helpers, labour.
- **other**: generator, tent, decor prop, water dispenser, outdoor heater, air cooler, crockery set. Also: decor, dg set, shamiana, misc.

## Money

Indians write amounts many ways. All of these are plain rupees in the JSON:
40k = 40000, 1.5 lakh = 1.5L = 1.5 lakhs = 150000, 2 crore = 20000000,
₹2,50,000 = Rs 250000 = INR 2,50,000 = 2,50,000/- = 250000.
Cue words: budget, under, max, within, around, up to, can spend.

## Cities and areas

- Mumbai: Mumbai, Bombay, Andheri, Bandra, Powai, Juhu, BKC, Worli, Lower Parel
- Navi Mumbai: Navi Mumbai, Vashi, Belapur, Kharghar, Panvel
- Thane: Thane
- Pune: Pune, Hinjewadi, Kharadi
- Bengaluru: Bengaluru, Bangalore
- Delhi NCR: Delhi, New Delhi, Gurgaon, Noida
- Hyderabad: Hyderabad
- Chennai: Chennai
- Kolkata: Kolkata
- Ahmedabad: Ahmedabad

## Urgency

- high: urgent, urgently, asap, immediately, urgent hai, last minute, at the earliest
- low: no rush, flexible, planning ahead, not urgent, whenever available
- anything else: medium

## Hinglish

"chahiye" = need, "ki zarurat hai" = is needed, "bhi" = also, "ko" = on (a date),
"urgent hai" = it is urgent.

## Worked examples

Request: Need 250 banquet chairs with covers in Navi Mumbai on 12 Oct, 6pm-11pm. Budget 40k. Urgent
JSON: {"category":"furniture","title":"250 banquet chairs","quantity":250,"unit":"unit","minCapacity":null,"budget":40000,"city":"Navi Mumbai","dateText":"12 Oct","startTime":"18:00","endTime":"23:00","urgency":"high","notes":"with covers"}

Request: looking for a banquet hall for 300 guests in Pune this Saturday, budget around 1.5 lakh
JSON: {"category":"banquet_space","title":"Banquet hall for 300 guests","quantity":1,"unit":"unit","minCapacity":300,"budget":150000,"city":"Pune","dateText":"this Saturday","startTime":null,"endTime":null,"urgency":"medium","notes":null}
