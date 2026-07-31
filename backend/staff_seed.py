"""Initial site staff roster (seeded once into site_staff table).

Names here must match users.full_name exactly (see user_seed.py) —
this list feeds the "screened by" dropdown on the Screening Form, and
ScreeningForm.jsx auto-fills that field by matching the logged-in
nurse's full_name against this list.

Cross-checked against PORTAL_Site_Research_Staff_List_3.pdf (the
authoritative roster) on 2026-07-31.
"""

DEFAULT_SITE_STAFF: dict[str, list[str]] = {
    "PGIMER": [
        "Geetika",
        "Navkiran Kaur",
        "Priyanka Thakur",
        "Seemran Kaur",
        "Tanvi Saini",
        "Yashvi Jolly",
        "Dr. Mannat Guliani",
        "Dr. Shalini Dhiman",
    ],
    "GMCH": [
        "Anosh",
        "Arushi",
        "Arzoo",
        "Muskan",
        "Vanika",
        "Dr. Manpreet Kaur",
    ],
    "IOG": [
        "C. Kanmani",
        "K. Poovaran",
        "M. Immanuel",
        "P. Durga Devi",
        "S. Durga",
        "S. Keerthana",
        "Dr. Sobhana",
    ],
    "AFMC": ["Mannat Guliani", "Shalini Dhiman"],  # no staff listed in source PDF yet
    "GMCH-A": [
        "Ankita Balu Kasbe",
        "Nandini Ratan Borde",
        "Pratiksha Manoj Khare",
        "Rohit Pawar",
        "Samiksha Deepak Khandagale",
        "Saurabh Joseph Sable",
        "Dr. Kirti Vishnu Rathod",
    ],
    "AMC": [
        "Bristina Pegu",
        "Oli Konwar",
        "Pompy Sonowal",
        "Rajashree Boruah",
        "Supriya Neog",
        "Nafifa Tasmeen Rahman",
    ],
}