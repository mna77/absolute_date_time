app_name = "absolute_date_time"
app_title = "Absolute Date Time"
app_publisher = "Fibersoft"
app_description = "Exact date and time in the Activity section, and Pane View (list and document side by side) for every DocType"
app_email = "info@fibersoft.online"
app_license = "mit"

required_apps = ["frappe"]

# ------------------------------------------------------------------
# Desk assets (loaded once, on every Desk page, for every DocType)
# ------------------------------------------------------------------
app_include_js = [
	"/assets/absolute_date_time/js/absolute_date_time.js",
	"/assets/absolute_date_time/js/pane_view.js",
]
app_include_css = [
	"/assets/absolute_date_time/css/absolute_date_time.css",
	"/assets/absolute_date_time/css/pane_view.css",
]

# ------------------------------------------------------------------
# Install / migrate / uninstall
# Creates (and keeps) the "Absolute Date and Time" checkbox and the
# "Pane View" section in System Settings.
# ------------------------------------------------------------------
after_install = "absolute_date_time.install.after_install"
after_migrate = "absolute_date_time.install.after_migrate"
before_uninstall = "absolute_date_time.install.before_uninstall"

# ------------------------------------------------------------------
# Boot: send the settings to the browser on every page load
# ------------------------------------------------------------------
extend_bootinfo = "absolute_date_time.boot.extend_bootinfo"

# ------------------------------------------------------------------
# No doc_events on System Settings: nothing from this app runs while
# System Settings is being saved, so it can never block a save.
# Values are checked when they are read (boot.py) and in the form.
# ------------------------------------------------------------------
