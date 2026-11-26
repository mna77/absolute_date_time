/*
 * Absolute Date Time
 * ------------------
 * When "Absolute Date and Time" is ticked in System Settings, every timestamp in
 * the Activity section (timeline) of every document, in every DocType, shows the
 * exact date and time, followed by the relative time:
 *
 *     14-11-2026 23:36:27 (9 hours ago)
 *
 * - Only the Activity section of forms is changed. List views, notifications,
 *   reports, etc. stay as they are.
 * - The exact time uses each user's Date Format, Time Format and Time Zone
 *   (frappe.datetime.str_to_user), the same as the timestamp's hover title.
 * - The relative part keeps updating every minute (Frappe's own refresh_when).
 * - Switching the checkbox on/off applies live to every logged-in user.
 */
(function () {
	"use strict";

	if (window.__fs_absolute_date_time_loaded) return;
	window.__fs_absolute_date_time_loaded = true;

	var FIELD = "absolute_date_and_time";
	var REALTIME_EVENT = "fs_absolute_date_time";
	var TIMELINE_SELECTOR = ".new-timeline";
	var TIMESTAMP_SELECTOR = ".frappe-timestamp";
	var WRAP_CLASS = "fs-abs-dt";
	var EXACT_CLASS = "fs-abs-dt-exact";
	var OBSERVER_KEY = "__fsAbsDtObserver";
	var PENDING_KEY = "__fsAbsDtPending";

	var override = null; // set when the setting changes during this page session

	// ------------------------------------------------------------------
	// State
	// ------------------------------------------------------------------
	function to_flag(value) {
		return value === true || value === 1 || value === "1" || value === "true";
	}

	function is_enabled() {
		if (override !== null) return override;
		var boot = window.frappe && frappe.boot ? frappe.boot : {};
		if (boot[FIELD] !== undefined && boot[FIELD] !== null) return to_flag(boot[FIELD]);
		// fallback: System Settings values are also stored as system defaults
		return !!(boot.sysdefaults && to_flag(boot.sysdefaults[FIELD]));
	}

	function set_enabled(value) {
		override = to_flag(value);
		if (window.frappe && frappe.boot) frappe.boot[FIELD] = override ? 1 : 0;
		apply_state();
	}

	// ------------------------------------------------------------------
	// Formatting
	// ------------------------------------------------------------------
	function exact_text(raw) {
		try {
			if (!raw || !frappe.datetime || typeof frappe.datetime.str_to_user !== "function") {
				return "";
			}
			var text = frappe.datetime.str_to_user(raw);
			if (!text || String(text).indexOf("Invalid") !== -1) return "";
			return String(text);
		} catch (e) {
			return "";
		}
	}

	// ------------------------------------------------------------------
	// DOM: add / remove the exact date-time around one timestamp
	// ------------------------------------------------------------------
	function is_wrapped(ts_el) {
		var p = ts_el.parentNode;
		return !!(p && p.classList && p.classList.contains(WRAP_CLASS));
	}

	// Output of the old per-DocType client script:  <b>exact</b> (<span class="frappe-timestamp">…</span>)
	function already_absolute(ts_el) {
		var prev = ts_el.previousSibling;
		if (!prev || prev.nodeType !== 3 || !/\(\s*$/.test(prev.nodeValue || "")) return false;
		var before = prev.previousSibling;
		return !!(before && before.nodeType === 1 && before.tagName === "B");
	}

	function decorate(ts_el) {
		if (!ts_el || !ts_el.parentNode) return;
		if (ts_el.classList.contains("mini")) return;

		var raw = ts_el.getAttribute("data-timestamp");

		if (is_wrapped(ts_el)) {
			// keep the exact text correct if Frappe re-used the element
			var wrap = ts_el.parentNode;
			if (wrap.getAttribute("data-abs-timestamp") !== raw) {
				var text = exact_text(raw);
				var exact = wrap.querySelector("." + EXACT_CLASS);
				if (text && exact) {
					exact.textContent = text;
					wrap.setAttribute("data-abs-timestamp", raw);
				}
			}
			return;
		}

		if (already_absolute(ts_el)) return;

		var label = exact_text(raw);
		if (!label) return;

		var wrapper = document.createElement("span");
		wrapper.className = WRAP_CLASS;
		wrapper.setAttribute("data-abs-timestamp", raw);

		var b = document.createElement("b");
		b.className = EXACT_CLASS;
		b.textContent = label;

		ts_el.parentNode.insertBefore(wrapper, ts_el);
		wrapper.appendChild(b);
		wrapper.appendChild(document.createTextNode(" ("));
		wrapper.appendChild(ts_el); // same element: Frappe still refreshes "x hours ago"
		wrapper.appendChild(document.createTextNode(")"));
	}

	function undecorate(wrapper) {
		var parent = wrapper.parentNode;
		if (!parent) return;
		var ts_el = wrapper.querySelector(TIMESTAMP_SELECTOR);
		if (ts_el) parent.insertBefore(ts_el, wrapper);
		parent.removeChild(wrapper);
	}

	function decorate_all(root) {
		if (!root || !is_enabled()) return;
		var list = root.querySelectorAll(TIMESTAMP_SELECTOR);
		for (var i = 0; i < list.length; i++) decorate(list[i]);
	}

	function undecorate_all(root) {
		var list = (root || document).querySelectorAll("." + WRAP_CLASS);
		for (var i = 0; i < list.length; i++) undecorate(list[i]);
	}

	// ------------------------------------------------------------------
	// Watch each form's Activity section (handles async rendering,
	// new comments, emails, "load more", document switching, etc.)
	// ------------------------------------------------------------------
	function schedule(timeline_el) {
		if (timeline_el[PENDING_KEY]) return;
		timeline_el[PENDING_KEY] = true;
		var run = function () {
			timeline_el[PENDING_KEY] = false;
			decorate_all(timeline_el);
		};
		if (window.requestAnimationFrame) window.requestAnimationFrame(run);
		else setTimeout(run, 0);
	}

	function watch(timeline_el) {
		if (!timeline_el) return;
		if (!timeline_el[OBSERVER_KEY] && window.MutationObserver) {
			var observer = new MutationObserver(function () {
				if (is_enabled()) schedule(timeline_el);
			});
			observer.observe(timeline_el, { childList: true, subtree: true });
			timeline_el[OBSERVER_KEY] = observer;
		}
		if (is_enabled()) schedule(timeline_el);
	}

	function get_timeline_element(frm) {
		if (!frm) return null;
		if (frm.timeline && frm.timeline.timeline_wrapper && frm.timeline.timeline_wrapper[0]) {
			return frm.timeline.timeline_wrapper[0];
		}
		if (frm.$wrapper && frm.$wrapper.find) {
			return frm.$wrapper.find(TIMELINE_SELECTOR).get(0) || null;
		}
		return null;
	}

	function attach_to_form(frm) {
		var el = get_timeline_element(frm);
		if (el) {
			watch(el);
		} else {
			// timeline not built yet: try once more after the current render
			setTimeout(function () {
				watch(get_timeline_element(frm));
			}, 300);
		}
	}

	function watch_all_timelines() {
		var list = document.querySelectorAll(TIMELINE_SELECTOR);
		for (var i = 0; i < list.length; i++) watch(list[i]);
	}

	function apply_state() {
		if (is_enabled()) {
			watch_all_timelines();
			var list = document.querySelectorAll(TIMELINE_SELECTOR);
			for (var i = 0; i < list.length; i++) decorate_all(list[i]);
		} else {
			undecorate_all(document);
		}
	}

	// ------------------------------------------------------------------
	// Wiring
	// ------------------------------------------------------------------

	// Triggered by Frappe on every form refresh, for every DocType (v14 / v15)
	$(document).on("form-refresh", function (e, frm) {
		attach_to_form(frm);
	});

	$(document).on("app_ready", function () {
		bind_system_settings_form();
		apply_state();

		// live on/off for all users when System Settings is saved
		try {
			if (frappe.realtime && typeof frappe.realtime.on === "function") {
				frappe.realtime.on(REALTIME_EVENT, function (data) {
					set_enabled(data && data.enabled);
				});
			}
		} catch (e) {
			// realtime not available: change applies on next page reload
		}
	});

	// immediate effect for the user who saves System Settings
	var settings_form_bound = false;
	function bind_system_settings_form() {
		if (settings_form_bound) return;
		if (frappe.ui && frappe.ui.form && typeof frappe.ui.form.on === "function") {
			settings_form_bound = true;
			frappe.ui.form.on("System Settings", {
				after_save: function (frm) {
					if (frm.doc && Object.prototype.hasOwnProperty.call(frm.doc, FIELD)) {
						set_enabled(frm.doc[FIELD]);
					}
				},
			});
		}
	}
	bind_system_settings_form();

	// small API for debugging from the browser console
	frappe.provide("frappe.absolute_date_time");
	frappe.absolute_date_time.is_enabled = is_enabled;
	frappe.absolute_date_time.refresh = apply_state;
})();
