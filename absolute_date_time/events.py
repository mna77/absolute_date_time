"""Kept for compatibility only. These functions are no longer registered in hooks.py:
nothing from this app runs while System Settings is saved. They stay here so that a
server still holding an old hook list in its cache can call them without an error."""
import frappe
from frappe import _
from frappe.utils import cint

from absolute_date_time.boot import clamp_width, get_pane_settings, parse_doctypes
from absolute_date_time.constants import (
	FIELDNAME,
	PANE_EXCLUDED,
	PANE_REALTIME_EVENT,
	PANE_VALUE_FIELDS,
	PANE_WIDTH,
	REALTIME_EVENT,
)


def _changed(doc, fieldname):
	if not doc.meta.has_field(fieldname):
		return False
	try:
		return doc.has_value_changed(fieldname)
	except Exception:
		return True


def validate_system_settings(doc, method=None):
	if doc.meta.has_field(PANE_WIDTH):
		doc.set(PANE_WIDTH, clamp_width(doc.get(PANE_WIDTH)))

	if doc.meta.has_field(PANE_EXCLUDED):
		resolved, unknown = [], []
		for name in parse_doctypes(doc.get(PANE_EXCLUDED)):
			# exact spelling of the DocType (the browser compares names exactly)
			real = frappe.db.get_value("DocType", name, "name")
			if real:
				if real not in resolved:
					resolved.append(real)
			else:
				unknown.append(name)
		if unknown:
			# never block saving System Settings: drop unknown names and warn
			frappe.msgprint(
				_("Removed from Disable Pane View for These DocTypes (not found): {0}").format(
					", ".join(frappe.bold(frappe.utils.escape_html(n)) for n in unknown)
				),
				title=_("Pane View"),
				indicator="orange",
			)
		doc.set(PANE_EXCLUDED, "\n".join(resolved))


def on_system_settings_update(doc, method=None):
	# no user / room = broadcast to every Desk user on this site,
	# sent only after the save is committed
	if _changed(doc, FIELDNAME):
		frappe.publish_realtime(
			REALTIME_EVENT,
			{"enabled": cint(doc.get(FIELDNAME))},
			after_commit=True,
		)

	if any(_changed(doc, f) for f in PANE_VALUE_FIELDS):
		frappe.publish_realtime(
			PANE_REALTIME_EVENT,
			get_pane_settings({f: doc.get(f) for f in PANE_VALUE_FIELDS if doc.meta.has_field(f)}),
			after_commit=True,
		)
