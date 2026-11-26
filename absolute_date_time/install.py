import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from absolute_date_time.constants import (
	ALL_FIELDS,
	FIELDNAME,
	PANE_COLUMN,
	PANE_DEFAULT_WIDTH,
	PANE_ENABLED,
	PANE_EXCLUDED,
	PANE_OPEN_BY_DEFAULT,
	PANE_SECTION,
	PANE_WIDTH,
	SETTINGS_DOCTYPE,
)


def _last_standard_field():
	"""Fieldname of the last standard (non-custom) field in System Settings, so the
	Pane View section is added at the very end and never splits an existing section."""
	meta = frappe.get_meta(SETTINGS_DOCTYPE)
	standard = [df.fieldname for df in meta.fields if not df.get("is_custom_field") and df.fieldname not in ALL_FIELDS]
	return standard[-1] if standard else None


def get_custom_fields():
	pane_after = _last_standard_field()
	return {
		SETTINGS_DOCTYPE: [
			{
				"fieldname": FIELDNAME,
				"label": "Absolute Date and Time",
				"fieldtype": "Check",
				"default": "0",
				"insert_after": "time_format",
				"description": (
					"Show the exact date and time in the Activity section of every document, "
					"e.g. 14-11-2026 23:36:27 (9 hours ago). Uses the Date Format, Time Format "
					"and Time Zone of each user."
				),
			},
			{
				"fieldname": PANE_SECTION,
				"label": "Pane View",
				"fieldtype": "Section Break",
				"insert_after": pane_after,
			},
			{
				"fieldname": PANE_ENABLED,
				"label": "Enable Pane View",
				"fieldtype": "Check",
				"default": "0",
				"insert_after": PANE_SECTION,
				"description": (
					"Adds Pane View to the view switcher of every list: the list on the left and the "
					"selected document on the right, side by side, with a divider you can drag."
				),
			},
			{
				"fieldname": PANE_OPEN_BY_DEFAULT,
				"label": "Open Lists in Pane View by Default",
				"fieldtype": "Check",
				"default": "0",
				"insert_after": PANE_ENABLED,
				"depends_on": f"eval:doc.{PANE_ENABLED}",
				"description": "Users can still switch back to List View. Each user's own choice per DocType is remembered.",
			},
			{
				"fieldname": PANE_COLUMN,
				"fieldtype": "Column Break",
				"insert_after": PANE_OPEN_BY_DEFAULT,
			},
			{
				"fieldname": PANE_WIDTH,
				"label": "Default List Width (%)",
				"fieldtype": "Int",
				"default": str(PANE_DEFAULT_WIDTH),
				"insert_after": PANE_COLUMN,
				"depends_on": f"eval:doc.{PANE_ENABLED}",
				"description": "Between 20 and 80. Users can drag the divider; double-click it to return to this width.",
			},
			{
				"fieldname": PANE_EXCLUDED,
				"label": "Disable Pane View for These DocTypes",
				"fieldtype": "Small Text",
				"insert_after": PANE_WIDTH,
				"depends_on": f"eval:doc.{PANE_ENABLED}",
				"description": "One DocType per line.",
			},
		]
	}


def setup_custom_fields():
	"""Create or update the fields. Safe to run any number of times."""
	create_custom_fields(get_custom_fields(), ignore_validate=True, update=True)
	frappe.clear_cache(doctype=SETTINGS_DOCTYPE)


def after_install():
	setup_custom_fields()


def after_migrate():
	# keeps the fields present even if someone deletes one by mistake
	setup_custom_fields()


def before_uninstall():
	for fieldname in ALL_FIELDS:
		custom_field = frappe.db.get_value(
			"Custom Field", {"dt": SETTINGS_DOCTYPE, "fieldname": fieldname}, "name"
		)
		if custom_field:
			frappe.delete_doc("Custom Field", custom_field, ignore_permissions=True, force=True)

		# remove the stored single value and the system default
		frappe.db.delete("Singles", {"doctype": SETTINGS_DOCTYPE, "field": fieldname})
		frappe.db.delete("DefaultValue", {"parent": "__default", "defkey": fieldname})

	frappe.clear_cache(doctype=SETTINGS_DOCTYPE)
