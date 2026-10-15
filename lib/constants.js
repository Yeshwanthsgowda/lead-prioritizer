// Single source of truth for timeline ordering.
// Used in the sort logic (client-side) and re-exported for the form dropdown
// so both always agree on the exact strings.

export const TIMELINE_ORDER = [
  "Within 1 month",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just exploring",
];

// Curated demo sample leads for quick-filling the "New lead" form during demos.
export const DEMO_SAMPLE_LEADS = [
  {
    expected: "Hot",
    name: "Ananya Reddy",
    phone: "+91 98765 11001",
    email: "ananya.reddy@example.com",
    location: "Gachibowli, Hyderabad",
    property_requirement: "3BHK ready-to-move apartment",
    budget: "1.5-1.8 Cr",
    timeline: "Within 1 month",
    message: "Hi, my SBI home loan of 1.2 Cr is already sanctioned. I got transferred to Hyderabad and need to move in by next month. Can I visit this Saturday and see two or three ready units? Also what are the registration and stamp duty charges roughly?"
  },
  {
    expected: "Hot",
    name: "Karthik Menon",
    phone: "+91 98765 11002",
    email: "",
    location: "Kakkanad, Kochi",
    property_requirement: "2BHK near Infopark",
    budget: "75-85 lakh",
    timeline: "Within 1 month",
    message: "We are selling our current flat and the money will be in by the 20th, so funds are not an issue. If the unit matches, we want to pay the token amount this weekend. Please send floor plans and tell me if the occupancy certificate is received."
  },
  {
    expected: "Hot",
    name: "Amit Verma",
    phone: "+91 98765 11003",
    email: "",
    location: "Wakad, Pune",
    property_requirement: "3BHK",
    budget: "1.1 Cr",
    timeline: "Within 1 month",
    message: "bhai kal hi site visit karna hai, ICICI se loan pre-approved hai. 3bhk chahiye wakad me, possession jaldi chahiye kyunki lease khatam ho rahi hai. kal 11 baje aa sakte hain? parking bhi chahiye 2 gaadi ki"
  },
  {
    expected: "Hot",
    name: "Neha Kapoor",
    phone: "+91 98765 11004",
    email: "neha.kapoor@example.com",
    location: "Sector 150, Noida",
    property_requirement: "3BHK with servant room",
    budget: "1.4 Cr",
    timeline: "Within 1 month",
    message: "We want to shift before my daughter's school admission in April. Budget is fixed at 1.4 Cr including parking. I am a bit worried about the builder's delivery record and monthly maintenance, can you share both? We can visit this Sunday."
  },
  {
    expected: "Warm",
    name: "Sandeep Joshi",
    phone: "+91 98765 11005",
    email: "",
    location: "Baner, Pune",
    property_requirement: "2BHK apartment",
    budget: "around 95 lakh",
    timeline: "1-3 months",
    message: "Comparing Baner and Balewadi right now. My wife wants something close to a good school. What is the price per sqft and are there any festive offers? We will decide after Diwali, so no rush."
  },
  {
    expected: "Warm",
    name: "Meera Pillai",
    phone: "+91 98765 11006",
    email: "meera.pillai@example.com",
    location: "Electronic City, Bangalore",
    property_requirement: "2BHK",
    budget: "70 lakh",
    timeline: "3-6 months",
    message: "I am a first-time buyer and honestly confused about the home loan process and RERA. My salary is about 18 lakh a year. Can someone explain how much loan I would get and what the total cost would be including registration?"
  },
  {
    expected: "Warm",
    name: "Rohan Desai",
    phone: "+91 98765 11007",
    email: "",
    location: "Powai, Mumbai",
    property_requirement: "1BHK for investment",
    budget: "1.3 Cr",
    timeline: "3-6 months",
    message: "Looking at this purely as an investment. What rent can I expect and how has the price moved in this area over the last few years? I am also looking at two other projects, so please send details so I can compare."
  },
  {
    expected: "Warm",
    name: "Pooja Singh",
    phone: "+91 98765 11008",
    email: "",
    location: "Sector 62, Noida",
    property_requirement: "2BHK",
    budget: "55-60 lakh",
    timeline: "1-3 months",
    message: "hello, 2bhk dekh rahi hu sector 62 me, budget thoda tight hai 55 se 60 lakh. EMI kitni aayegi? papa se puchna padega pehle. photos bhej do please"
  },
  {
    expected: "Cold",
    name: "Vishal Gupta",
    phone: "+91 98765 11009",
    email: "",
    location: "Pune",
    property_requirement: "Not sure",
    budget: "",
    timeline: "Just exploring",
    message: "price list"
  },
  {
    expected: "Cold",
    name: "Divya Nair",
    phone: "+91 98765 11010",
    email: "divya.nair@example.com",
    location: "Chennai",
    property_requirement: "Plot or flat, not decided",
    budget: "",
    timeline: "6+ months",
    message: "Hi, just browsing options for the future, maybe in 2 years after I finish my MBA. Please add me to your mailing list."
  },
  {
    expected: "Cold",
    name: "Imran Sheikh",
    phone: "+91 98765 11011",
    email: "",
    location: "Banjara Hills, Hyderabad",
    property_requirement: "3BHK",
    budget: "50 lakh",
    timeline: "6+ months",
    message: "3bhk in banjara hills under 50 lakh? let me know if you have anything, not in a hurry"
  },
  {
    expected: "Cold",
    name: "Ravi Kumar",
    phone: "+91 98765 11012",
    email: "",
    location: "Bangalore",
    property_requirement: "",
    budget: "",
    timeline: "Just exploring",
    message: "hi"
  }
];
