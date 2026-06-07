"""Initial site staff roster (seeded once into site_staff table)."""

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
        "Arushu",
        "Arzoo",
        "Muskan",
        "Vanika",
        "Dr. Manpreet Kaur",
    ],
    "IOG": ["Yashvi Jolly"],
    "AFMC": ["Mannat Guliani", "Shalini Dhiman"],
    "GMCH-A": ["Nurse A", "Nurse B"],
    "AMC": ["Nurse A", "Nurse B"],
}
