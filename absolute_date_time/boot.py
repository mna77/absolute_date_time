import frappe
from frappe.utils import cint

from absolute_date_time.constants import (
	FIELDNAME,
	PANE_DEFAULT_WIDTH,
	PANE_ENABLED,
	PANE_EXCLUDED,
	PANE_MAX_WIDTH,
	PANE_MIN_WIDTH,
	PANE_OPEN_BY_DEFAULT,
	PANE_WIDTH,
	SETTINGS_DOCTYPE,
)


def _value(fieldname, default=None):
	if not frappe.get_meta(SETTINGS_DOCTYPE).has_field(fieldname):
		return default
	value = frappe.db.get_single_value(SETTINGS_DOCTYPE, fieldname)
	return default if value is None else value


def clamp_width(value):
	width = cint(value) or PANE_DEFAULT_WIDTH
	return max(PANE_MIN_WIDTH, min(PANE_MAX_WIDTH, width))


def parse_doctypes(text):
	return [line.strip() for line in str(text or "").splitlines() if line.strip()]


def resolve_doctypes(names):
	"""Exact DocType names (any letter case accepted); unknown names are ignored."""
	names = [n for n in names if n]
	if not names:
		return []
	existing = frappe.get_all("DocType", filters={"name": ["in", names]}, pluck="name")
	by_lower = {n.lower(): n for n in existing}
	out = []
	for n in names:
		real = by_lower.get(n.lower())
		if real and real not in out:
			out.append(real)
	return out


def is_enabled():
	try:
		return cint(_value(FIELDNAME, 0))
	except Exception:
		# boot must never fail because of this app
		return 0


def get_pane_settings(values=None):
	"""Pane View settings for the browser. `values` lets a just-saved document be used."""
	get = (lambda f, d=None: values.get(f, d)) if values is not None else _value
	try:
		return {
			"enabled": cint(get(PANE_ENABLED, 0)),
			"open_by_default": cint(get(PANE_OPEN_BY_DEFAULT, 0)),
			"width": clamp_width(get(PANE_WIDTH, PANE_DEFAULT_WIDTH)),
			"excluded": resolve_doctypes(parse_doctypes(get(PANE_EXCLUDED, ""))),
		}
	except Exception:
		return {"enabled": 0, "open_by_default": 0, "width": PANE_DEFAULT_WIDTH, "excluded": []}


@frappe.whitelist()
def get_pane_view_settings():
	"""Fallback for the browser when the page was loaded without the Pane View settings."""
	return get_pane_settings()


def extend_bootinfo(bootinfo):
	# runs on every page load (not cached), so the values are always current
	bootinfo[FIELDNAME] = is_enabled()
	bootinfo["fs_pane_view"] = get_pane_settings()
