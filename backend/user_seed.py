"""
Login accounts seeded from PORTAL_Site_Research_Staff_List.pdf.

Only covers the roles we have real names for: site_scientist (the PDF's
"Research Scientist" per site) and nurse. It deliberately does NOT invent
accounts for superadmin, project_scientist (head), or site_pi — those
names haven't been supplied yet. Add them here once you have them; the
seeder is idempotent (skips usernames that already exist).

AFMC has no staff listed in the source PDF and is intentionally absent
from DEFAULT_LOGIN_USERS below.

username = firstname.sitecode, lowercase, no spaces/periods within the name.
"""

# (username, full_name, role, site_name)
DEFAULT_LOGIN_USERS: list[tuple[str, str, str, str]] = [
    # ---- PGIMER Chandigarh ----
    ("shalini.pgimer", "Dr. Shalini Dhiman", "site_scientist", "PGIMER"),
    ("geetika.pgimer", "Geetika", "nurse", "PGIMER"),
    ("tanvi.pgimer", "Tanvi Saini", "nurse", "PGIMER"),
    ("seemran.pgimer", "Seemran Kaur", "nurse", "PGIMER"),
    ("priyanka.pgimer", "Priyanka Thakur", "nurse", "PGIMER"),
    ("navkiran.pgimer", "Navkiran Kaur", "nurse", "PGIMER"),
    ("yashvi.pgimer", "Yashvi Jolly", "nurse", "PGIMER"),

    # ---- GMCH Aurangabad ----
    ("kirti.gmcha", "Dr. Kirti Vishnu Rathod", "site_scientist", "GMCH-A"),
    ("samiksha.gmcha", "Samiksha Deepak Khandagale", "nurse", "GMCH-A"),
    ("pratiksha.gmcha", "Pratiksha Manoj Khare", "nurse", "GMCH-A"),
    ("saurabh.gmcha", "Saurabh Joseph Sable", "nurse", "GMCH-A"),
    ("nandini.gmcha", "Nandini Ratan Borde", "nurse", "GMCH-A"),
    ("varad.gmcha", "Varad Gurunath Naik", "nurse", "GMCH-A"),
    ("ankita.gmcha", "Ankita Balu Kasbe", "nurse", "GMCH-A"),

    # ---- GMCH Chandigarh ----
    ("manpreet.gmch", "Dr. Manpreet Kaur", "site_scientist", "GMCH"),
    ("anosh.gmch", "Anosh", "nurse", "GMCH"),
    ("vanika.gmch", "Vanika", "nurse", "GMCH"),
    ("muskan.gmch", "Muskan", "nurse", "GMCH"),
    ("arzoo.gmch", "Arzoo", "nurse", "GMCH"),
    ("arushi.gmch", "Arushi", "nurse", "GMCH"),

    # ---- Assam Medical College & Hospital, Dibrugarh ----
    ("nafifa.amc", "Nafifa Tasmeen Rahman", "site_scientist", "AMC"),
    ("oli.amc", "Oli Konwar", "nurse", "AMC"),
    ("bristina.amc", "Bristina Pegu", "nurse", "AMC"),
    ("pompy.amc", "Pompy Sonowal", "nurse", "AMC"),
    ("rajashree.amc", "Rajashree Boruah", "nurse", "AMC"),
    ("supriya.amc", "Supriya Neog", "nurse", "AMC"),

    # ---- Institute of Obstetrics and Gynaecology (IOG), Chennai ----
    ("sobhana.iog", "Dr. Sobhana", "site_scientist", "IOG"),
    ("immanuel.iog", "M. Immanuel", "nurse", "IOG"),
    ("poovaran.iog", "K. Poovaran", "nurse", "IOG"),
    ("kanmani.iog", "C. Kanmani", "nurse", "IOG"),
    ("durgadevi.iog", "P. Durga Devi", "nurse", "IOG"),
    ("keerthana.iog", "S. Keerthana", "nurse", "IOG"),
    ("durga.iog", "S. Durga", "nurse", "IOG"),

    # ---- AFMC: no staff names supplied yet ----
    # ---- Site PIs, the project scientist (head), and superadmin: add once named ----
]
