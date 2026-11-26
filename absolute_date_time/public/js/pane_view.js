/*
 * Pane View
 * ---------
 * Adds "Pane View" to the view switcher of every list (when enabled in System Settings):
 * the list stays on the left and the selected document opens on the right as a full,
 * live form (edit, save, print, realtime updates). The divider between them can be dragged.
 *
 * How it works
 * - The right pane is a same-origin <iframe class="fs-pane-frame"> showing the normal form.
 *   After the first load, other documents open inside it without a page reload.
 * - Inside the pane (embedded mode) the navbar is hidden and the pane reports its route
 *   to the list, so the open row stays highlighted.
 *
 * Safety
 * - Only the List view of a DocType is changed; Report, Kanban, Calendar, etc. are untouched.
 * - Below 992 px wide the normal list layout is used.
 * - Unsaved changes in the pane are never dropped silently: you are asked first.
 * - Ctrl/Cmd/Shift/Alt + click, checkboxes, likes and filter links keep their normal behaviour.
 * - A pane never opens another pane inside itself.
 */
(function () {
	"use strict";

	if (window.__fs_pane_view_loaded) return;
	window.__fs_pane_view_loaded = true;

	const EMBEDDED = (() => {
		try {
			// frameElement is only readable when the parent page is the same site
			return !!(window.frameElement && window.frameElement.classList.contains("fs-pane-frame"));
		} catch (e) {
			return false;
		}
	})();
	if (EMBEDDED) document.documentElement.classList.add("fs-pane-embedded");

	frappe.provide("frappe.fs_pane_view");
	const PV = frappe.fs_pane_view;
	PV.embedded = EMBEDDED;

	const SOURCE = "fs-pane";
	const REALTIME_EVENT = "fs_pane_view_settings";

	// ================================================================== embedded (inside the pane)
	if (EMBEDDED) {
		const post = (msg) => {
			try {
				// frameElement check above guarantees the parent is this same site
				window.parent.postMessage(Object.assign({ source: SOURCE }, msg), "*");
			} catch (e) {
				/* parent gone */
			}
		};
		const title_of = (frm) => {
			const tf = frm.meta && frm.meta.title_field;
			const v = tf ? frm.doc[tf] : "";
			return v ? String(v) : frm.doc.name;
		};
		const report = () => {
			let route = [];
			try {
				route = frappe.get_route() || [];
			} catch (e) {
				/* router not ready */
			}
			const frm = window.cur_frm;
			const is_form = route[0] === "Form" && frm && frm.doc;
			post({
				type: "route",
				path: window.location.pathname,
				route: route.map((r) => (r == null ? "" : String(r))),
				doctype: is_form ? frm.doctype : route[1] || "",
				name: is_form ? frm.doc.name : route[2] || "",
				title: is_form ? title_of(frm) : document.title,
				dirty: is_form && frm.is_dirty ? !!frm.is_dirty() : false,
			});
		};
		PV.report = report;

		$(document).on("app_ready", () => {
			post({ type: "ready" });
			report();
			if (frappe.router && typeof frappe.router.on === "function") {
				frappe.router.on("change", () => setTimeout(report, 60));
			}
			if (frappe.ui && frappe.ui.keys && frappe.ui.keys.add_shortcut) {
				frappe.ui.keys.add_shortcut({
					shortcut: "alt+down",
					action: () => post({ type: "nav", dir: 1 }),
					description: __("Next document in the list"),
					ignore_inputs: true,
				});
				frappe.ui.keys.add_shortcut({
					shortcut: "alt+up",
					action: () => post({ type: "nav", dir: -1 }),
					description: __("Previous document in the list"),
					ignore_inputs: true,
				});
			}
		});
		// title / name changes after save or rename
		$(document).on("form-refresh", () => setTimeout(report, 60));
		window.addEventListener("pagehide", () => post({ type: "unload" }));
		return;
	}

	// ================================================================== list page (parent)
	const MIN_WIDTH = 20;
	const MAX_WIDTH = 80;
	const MIN_SCREEN = 992;
	const instances = new Set();

	const ICON = {
		up: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		down: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		reload: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		full: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		tab: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		close: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
		pane: '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect x="5" y="9" width="38" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 9v30" stroke="currentColor" stroke-width="2"/><path d="M9 16h7M9 21h7M9 26h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
	};

	// ------------------------------------------------------------------ settings and storage
	const cfg = () => (frappe.boot && frappe.boot.fs_pane_view) || {};
	const user = () =>
		(frappe.session && frappe.session.user) || (frappe.boot && frappe.boot.user && frappe.boot.user.name) || "";
	const store = {
		get(k) {
			try {
				return window.localStorage.getItem(k);
			} catch (e) {
				return null;
			}
		},
		set(k, v) {
			try {
				window.localStorage.setItem(k, v);
			} catch (e) {
				/* private mode */
			}
		},
		remove(k) {
			try {
				window.localStorage.removeItem(k);
			} catch (e) {
				/* private mode */
			}
		},
	};
	const key = (doctype, what) => `fs_pane_${what}:${user()}:${doctype}`;

	function clamp(v) {
		v = parseFloat(v);
		if (!isFinite(v)) v = parseFloat(cfg().width) || 40;
		return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, v));
	}
	const default_width = () => clamp(cfg().width || 40);

	PV.enabled_for = function (doctype) {
		const c = cfg();
		return !!c.enabled && !!doctype && !(c.excluded || []).includes(doctype);
	};
	PV.wants = function (doctype) {
		const v = store.get(key(doctype, "on"));
		if (v === "1") return true;
		if (v === "0") return false;
		return !!cfg().open_by_default;
	};
	PV.wide_enough = () => window.innerWidth >= MIN_SCREEN;

	function is_list(lv) {
		return !!(lv && lv.view_name === "List" && lv.doctype && lv.parent);
	}

	// true only while this list itself is the page on screen
	function on_this_list(lv) {
		try {
			const r = frappe.get_route();
			return r[0] === "List" && r[1] === lv.doctype && (!r[2] || r[2] === "List");
		} catch (e) {
			return false;
		}
	}

	function norm(path) {
		if (!path) return "";
		let p = String(path);
		try {
			p = decodeURIComponent(p);
		} catch (e) {
			/* keep as is */
		}
		return p.replace(/\/+$/, "");
	}

	// ------------------------------------------------------------------ building the pane
	function build(lv) {
		let st = lv.__fs_pane;
		if (st && st.$pane) return st;
		const $page = $(lv.parent);
		const $layout = $page.find(".layout-main").first();
		if (!$layout.length) return null;

		st = lv.__fs_pane = {
			lv,
			$page,
			$layout,
			active: false,
			iframe: null,
			ready: false,
			current_path: "", // decoded, for comparing with list rows
			current_raw: "", // as in the address bar, for navigating
			error: "",
			width: default_width(),
		};

		st.$splitter = $(`<div class="fs-pane-splitter" role="separator" aria-orientation="vertical"
				tabindex="0" title="${__("Drag to resize. Double-click to reset.")}"><span></span></div>`);
		st.$pane = $(`
			<div class="fs-pane" aria-label="${__("Document pane")}">
				<div class="fs-pane-bar">
					<a class="fs-pane-title" href="#" title="${__("Open full page")}">${__("No document selected")}</a>
					<span class="fs-pane-dirty fs-hidden" title="${__("Not saved")}"></span>
					<div class="fs-pane-actions">
						<button type="button" class="btn btn-default btn-xs fs-pane-btn" data-act="prev" title="${__("Previous (Alt+Up)")}">${ICON.up}</button>
						<button type="button" class="btn btn-default btn-xs fs-pane-btn" data-act="next" title="${__("Next (Alt+Down)")}">${ICON.down}</button>
						<button type="button" class="btn btn-default btn-xs fs-pane-btn" data-act="reload" title="${__("Reload")}">${ICON.reload}</button>
						<button type="button" class="btn btn-default btn-xs fs-pane-btn" data-act="full" title="${__("Open full page")}">${ICON.full}</button>
						<button type="button" class="btn btn-default btn-xs fs-pane-btn" data-act="tab" title="${__("Open in new tab")}">${ICON.tab}</button>
						<button type="button" class="btn btn-default btn-xs fs-pane-btn" data-act="close" title="${__("Close Pane View")}">${ICON.close}</button>
					</div>
				</div>
				<div class="fs-pane-body">
					<div class="fs-pane-empty">${ICON.pane}<p>${__("Select any record from the list and it will open here.")}</p></div>
					<div class="fs-pane-loading fs-hidden"><div class="fs-pane-spinner"></div></div>
					<div class="fs-pane-error fs-hidden">
						<p class="fs-pane-error-text"></p>
						<div>
							<button type="button" class="btn btn-default btn-sm" data-act="retry">${__("Try again")}</button>
							<button type="button" class="btn btn-primary btn-sm" data-act="full">${__("Open full page")}</button>
						</div>
					</div>
					<div class="fs-pane-shield"></div>
				</div>
			</div>`);
		$layout.append(st.$splitter, st.$pane);

		bind_splitter(st);
		st.$pane.on("click", "[data-act]", function (e) {
			e.preventDefault();
			action(st, $(this).attr("data-act"));
		});
		st.$pane.on("click", ".fs-pane-title", (e) => {
			e.preventDefault();
			action(st, "full");
		});
		// keep the "not saved" dot in step with edits made in the pane
		st.dirty_timer = setInterval(() => {
			if (st.active && st.current_path) st.$pane.find(".fs-pane-dirty").toggleClass("fs-hidden", !is_dirty(st));
		}, 1500);
		instances.add(st);
		return st;
	}

	function teardown(st) {
		if (!st) return;
		st.active = false;
		clearInterval(st.dirty_timer);
		clearTimeout(st.ready_timer);
		st.$page.removeClass("fs-pane-on fs-pane-dragging");
		st.$page.find(".list-row-container.fs-pane-current").removeClass("fs-pane-current");
		if (st.iframe) {
			try {
				st.iframe.src = "about:blank";
			} catch (e) {
				/* ignore */
			}
		}
		st.$splitter.remove();
		st.$pane.remove();
		instances.delete(st);
		if (st.lv.__fs_pane === st) st.lv.__fs_pane = null;
		update_menu(st.lv);
	}

	// ------------------------------------------------------------------ width and position
	function set_width(st, pct, save) {
		st.width = clamp(pct);
		st.$page[0].style.setProperty("--fs-pane-list-width", st.width + "%");
		st.$splitter.attr("aria-valuenow", Math.round(st.width));
		if (save) store.set(key(st.lv.doctype, "w"), String(Math.round(st.width * 10) / 10));
	}

	function update_top(st) {
		const nav = document.querySelector(".navbar");
		const head = st.$page.find(".page-head")[0];
		const top = (nav ? nav.offsetHeight : 0) + (head ? head.offsetHeight : 0) + 8;
		st.$page[0].style.setProperty("--fs-pane-top", top + "px");
	}

	function bind_splitter(st) {
		const el = st.$splitter[0];
		el.setAttribute("aria-valuemin", MIN_WIDTH);
		el.setAttribute("aria-valuemax", MAX_WIDTH);

		el.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			const rect = st.$layout[0].getBoundingClientRect();
			if (!rect.width) return;
			try {
				el.setPointerCapture(e.pointerId);
			} catch (err) {
				/* old browser */
			}
			st.$page.addClass("fs-pane-dragging");
			const move = (ev) => set_width(st, ((ev.clientX - rect.left) / rect.width) * 100, false);
			const up = () => {
				el.removeEventListener("pointermove", move);
				el.removeEventListener("pointerup", up);
				el.removeEventListener("pointercancel", up);
				st.$page.removeClass("fs-pane-dragging");
				set_width(st, st.width, true);
			};
			el.addEventListener("pointermove", move);
			el.addEventListener("pointerup", up);
			el.addEventListener("pointercancel", up);
		});

		el.addEventListener("dblclick", () => {
			store.remove(key(st.lv.doctype, "w"));
			set_width(st, default_width(), false);
		});

		el.addEventListener("keydown", (e) => {
			const step = e.shiftKey ? 10 : 2;
			if (e.key === "ArrowLeft") set_width(st, st.width - step, true);
			else if (e.key === "ArrowRight") set_width(st, st.width + step, true);
			else if (e.key === "Home") set_width(st, MIN_WIDTH, true);
			else if (e.key === "End") set_width(st, MAX_WIDTH, true);
			else return;
			e.preventDefault();
		});
	}

	// ------------------------------------------------------------------ activate / deactivate
	PV.activate = function (lv, persist) {
		if (!is_list(lv) || !PV.enabled_for(lv.doctype)) return false;
		if (persist) store.set(key(lv.doctype, "on"), "1");
		if (!PV.wide_enough()) {
			if (persist) {
				frappe.show_alert({
					message: __("Pane View needs a wider screen (at least {0} px).", [MIN_SCREEN]),
					indicator: "orange",
				});
			}
			update_menu(lv);
			return false;
		}
		const st = build(lv);
		if (!st) return false;
		st.active = true;
		set_width(st, store.get(key(lv.doctype, "w")) || default_width(), false);
		st.$page.addClass("fs-pane-on");
		update_top(st);
		highlight(st);
		update_menu(lv);
		return true;
	};

	PV.deactivate = function (lv, persist) {
		if (persist) store.set(key(lv.doctype, "on"), "0");
		const st = lv.__fs_pane;
		if (!st) return update_menu(lv);
		if (is_dirty(st)) {
			frappe.confirm(
				__("{0} has unsaved changes in the pane. Close Pane View without saving?", [
					frappe.utils.escape_html(st.title || __("This document")),
				]),
				() => teardown(st),
				() => persist && store.set(key(lv.doctype, "on"), "1")
			);
			return;
		}
		teardown(st);
	};

	PV.toggle = function (lv) {
		if (lv.__fs_pane && lv.__fs_pane.active) PV.deactivate(lv, true);
		else PV.activate(lv, true);
	};

	// Called on every show / render of a list
	PV.sync = function (lv) {
		if (!is_list(lv)) return;
		const st = lv.__fs_pane;
		if (!PV.enabled_for(lv.doctype)) {
			if (st) teardown(st);
			update_menu(lv);
			return;
		}
		if (st && st.active) {
			update_top(st);
			highlight(st);
		} else if (PV.wants(lv.doctype) && PV.wide_enough()) {
			PV.activate(lv, false);
		}
		add_fallback_menu_item(lv);
		update_menu(lv);
	};

	// When a user's role hides the view switcher, offer Pane View in the list's ... menu
	function add_fallback_menu_item(lv) {
		if (lv.__fs_pane_menu || lv.views_list || !lv.page || typeof lv.page.add_menu_item !== "function") return;
		if (!lv.init_promise) return; // list not built yet
		const $a = lv.page.add_menu_item(__("Pane View"), () => PV.toggle(lv), true);
		if ($a && $a.length) {
			$a.parent().addClass("fs-pane-menu-item");
			lv.__fs_pane_menu = $a;
		}
	}

	// ------------------------------------------------------------------ opening documents
	function frame_window(st) {
		try {
			return st.iframe && st.iframe.contentWindow;
		} catch (e) {
			return null;
		}
	}

	function is_dirty(st) {
		const w = frame_window(st);
		try {
			const frm = w && w.cur_frm;
			return !!(st.ready && frm && frm.doc && frm.is_dirty && frm.is_dirty() && w.frappe.get_route()[0] === "Form");
		} catch (e) {
			return false;
		}
	}

	function show_loading(st, on) {
		st.$pane.find(".fs-pane-loading").toggleClass("fs-hidden", !on);
	}

	function show_empty(st, on) {
		st.$pane.find(".fs-pane-empty").toggleClass("fs-hidden", !on);
	}

	const ERRORS = {
		blocked: () =>
			__("This document could not be shown inside the pane. Your server may block it (X-Frame-Options must allow the same site)."),
		page: () => __("The pane opened a page that is not a document. Your session may have expired; reload the page and sign in."),
		timeout: () => __("The document is taking too long to open in the pane."),
	};

	function show_error(st, kind) {
		clearTimeout(st.ready_timer);
		st.error = kind;
		show_loading(st, false);
		st.$pane.find(".fs-pane-error-text").text((ERRORS[kind] || ERRORS.timeout)());
		st.$pane.find(".fs-pane-error").removeClass("fs-hidden");
	}

	function hide_error(st) {
		st.error = "";
		st.$pane.find(".fs-pane-error").addClass("fs-hidden");
	}

	function on_frame_load(st) {
		if (!st.iframe || !st.active) return;
		let path = null;
		try {
			path = st.iframe.contentWindow.location.pathname;
		} catch (e) {
			path = null; // not readable: the browser refused to show the page in a frame
		}
		if (path === "blank") return; // about:blank
		if (path === null) return show_error(st, "blocked");
		if (!path.startsWith("/app")) return show_error(st, "page");
	}

	function set_title(st, text, dirty) {
		st.title = text || "";
		st.$pane.find(".fs-pane-title").text(text || __("No document selected"));
		st.$pane.find(".fs-pane-dirty").toggleClass("fs-hidden", !dirty);
	}

	function make_iframe(st) {
		const iframe = document.createElement("iframe");
		iframe.className = "fs-pane-frame"; // must be set before loading (embedded detection)
		iframe.setAttribute("title", __("Document pane"));
		iframe.setAttribute("loading", "eager");
		iframe.addEventListener("load", () => on_frame_load(st));
		st.$pane.find(".fs-pane-body")[0].appendChild(iframe);
		st.iframe = iframe;
		st.ready = false;
		return iframe;
	}

	function load_src(st, path) {
		st.ready = false;
		hide_error(st);
		show_loading(st, true);
		clearTimeout(st.ready_timer);
		st.ready_timer = setTimeout(() => {
			if (st.active && st.iframe && !st.ready && !st.error) show_error(st, "timeout");
		}, 30000);
		(st.iframe || make_iframe(st)).src = path;
	}

	PV.open = function (lv, path, label) {
		const st = lv.__fs_pane;
		if (!st || !st.active || !path) return;
		if (norm(path) === st.current_path && st.iframe && !st.error) return; // already open

		const go = () => {
			st.current_path = norm(path);
			st.current_raw = path;
			show_empty(st, false);
			set_title(st, label || decode_name(path), false);
			const w = frame_window(st);
			if (st.iframe && st.ready && !st.error && w && w.frappe && typeof w.frappe.set_route === "function") {
				try {
					w.frappe.set_route(path);
				} catch (e) {
					load_src(st, path);
				}
			} else {
				load_src(st, path);
			}
			highlight(st);
		};

		if (is_dirty(st)) {
			frappe.confirm(
				__("{0} has unsaved changes. Open {1} without saving?", [
					frappe.utils.escape_html(st.title || __("This document")),
					frappe.utils.escape_html(label || decode_name(path)),
				]),
				go
			);
		} else {
			go();
		}
	};

	function decode_name(path) {
		const parts = norm(path).split("/");
		return parts[parts.length - 1] || "";
	}

	// ------------------------------------------------------------------ rows
	function row_link(row) {
		return row.querySelector(".list-subject a[href]");
	}

	function rows(st) {
		return st.$page
			.find(".frappe-list .result .list-row-container")
			.toArray()
			.filter((r) => row_link(r));
	}

	function highlight(st) {
		rows(st).forEach((r) => {
			r.classList.toggle("fs-pane-current", !!st.current_path && norm(row_link(r).pathname) === st.current_path);
		});
	}

	function row_label(row) {
		const a = row_link(row);
		return (a && (a.getAttribute("title") || a.textContent || "").trim()) || decode_name(a && a.pathname);
	}

	PV.move = function (lv, dir) {
		const st = lv.__fs_pane;
		if (!st || !st.active) return;
		const list = rows(st);
		if (!list.length) return;
		let idx = list.findIndex((r) => norm(row_link(r).pathname) === st.current_path);
		const target = idx === -1 ? list[dir > 0 ? 0 : list.length - 1] : list[idx + dir];
		if (!target) {
			frappe.show_alert({
				message: dir > 0 ? __("This is the last document on this page.") : __("This is the first document on this page."),
				indicator: "blue",
			});
			return;
		}
		PV.open(lv, row_link(target).pathname, row_label(target));
		if (target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
	};

	// ------------------------------------------------------------------ toolbar actions
	function action(st, act) {
		const lv = st.lv;
		const w = frame_window(st);
		const path = current_frame_path(st);
		switch (act) {
			case "prev":
				return PV.move(lv, -1);
			case "next":
				return PV.move(lv, 1);
			case "reload":
				if (!st.iframe) return;
				try {
					if (st.ready && w.cur_frm && w.frappe.get_route()[0] === "Form") return w.cur_frm.reload_doc();
				} catch (e) {
					/* fall through */
				}
				return path && load_src(st, path);
			case "full":
				if (!path) return;
				if (is_dirty(st)) {
					return frappe.confirm(
						__("{0} has unsaved changes in the pane. Open the full page without them?", [
							frappe.utils.escape_html(st.title),
						]),
						() => frappe.set_route(path)
					);
				}
				return frappe.set_route(path);
			case "tab":
				if (path) window.open(path, "_blank", "noopener");
				return;
			case "retry":
				return path && load_src(st, path);
			case "close":
				return PV.deactivate(lv, true);
		}
	}

	function current_frame_path(st) {
		if (!st.iframe) return "";
		try {
			const p = st.iframe.contentWindow.location.pathname;
			if (p && p !== "blank" && p.startsWith("/app")) return p;
		} catch (e) {
			/* ignore */
		}
		return st.current_raw || "";
	}

	// ------------------------------------------------------------------ view switcher item
	function update_menu(lv) {
		if (!lv) return;
		const active = !!(lv.__fs_pane && lv.__fs_pane.active);
		if (lv.__fs_pane_menu && lv.__fs_pane_menu.length) {
			lv.__fs_pane_menu.find(".menu-item-label").text(active ? __("Close Pane View") : __("Pane View"));
		}
		if (lv.view_name === "List" && lv.views_menu && lv.views_menu.closest) {
			lv.views_menu
				.closest(".custom-btn-group")
				.find(".custom-btn-group-label")
				.first()
				.text(active ? __("Pane View") : __("List View"));
		}
	}

	PV.add_menu_item = function (select) {
		const lv = select && select.list_view;
		if (!lv || !select.page || !select.parent) return;
		if (!["List", "Report"].includes(lv.view_name) || !PV.enabled_for(select.doctype)) return;
		if (lv.__fs_pane_menu && lv.__fs_pane_menu.closest("body").length) return;

		const $a = select.page.add_custom_menu_item(
			select.parent,
			__("Pane View"),
			() => {
				if (lv.view_name === "List") {
					PV.toggle(lv);
				} else {
					store.set(key(select.doctype, "on"), "1");
					frappe.set_route("List", select.doctype, "List");
				}
			},
			true,
			null,
			"sidebar-expand"
		);
		if ($a && $a.length) {
			$a.parent().attr("data-view", "Pane").addClass("fs-pane-menu-item");
			lv.__fs_pane_menu = $a;
		}
		update_menu(lv);
	};

	function remove_menu_item(lv) {
		if (lv && lv.__fs_pane_menu) {
			lv.__fs_pane_menu.parent().remove();
			lv.__fs_pane_menu = null;
		}
	}

	// ------------------------------------------------------------------ patches
	function patch() {
		const LVS = frappe.views && frappe.views.ListViewSelect;
		if (LVS && !LVS.prototype.__fs_pane_patched && typeof LVS.prototype.setup_views === "function") {
			const orig = LVS.prototype.setup_views;
			LVS.prototype.setup_views = function () {
				const out = orig.apply(this, arguments);
				try {
					PV.add_menu_item(this);
				} catch (e) {
					console.warn("Pane View: menu item skipped", e);
				}
				return out;
			};
			LVS.prototype.__fs_pane_patched = true;
		}

		const LV = frappe.views && frappe.views.ListView;
		if (LV && !LV.prototype.__fs_pane_patched) {
			["render", "show"].forEach((method) => {
				const orig = LV.prototype[method];
				if (typeof orig !== "function") return;
				LV.prototype[method] = function () {
					const out = orig.apply(this, arguments);
					try {
						PV.sync(this);
					} catch (e) {
						console.warn("Pane View:", e);
					}
					return out;
				};
			});
			LV.prototype.__fs_pane_patched = true;
		}
	}

	// ------------------------------------------------------------------ events
	// Row clicks in Pane View open the document in the pane (capture phase, before the list's own handler)
	document.addEventListener(
		"click",
		(e) => {
			if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
			const target = e.target && e.target.closest ? e.target : null;
			if (!target) return;
			const row = target.closest(".list-row-container");
			if (!row) return;
			const lv = window.cur_list;
			const st = lv && lv.__fs_pane;
			if (!st || !st.active || !PV.wide_enough() || !st.$page[0].contains(row) || !on_this_list(lv)) return;
			if (
				target.closest(
					"input, select, textarea, button, .dropdown, .list-row-checkbox, .filterable, .select-like, .file-select, .list-row-like, .like-action, .list-actions, [data-filter]"
				)
			) {
				return;
			}
			const a = row_link(row);
			if (!a || !a.pathname || !a.pathname.startsWith("/app/")) return;
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			PV.open(lv, a.pathname, row_label(row));
		},
		true
	);

	// Messages from the pane
	window.addEventListener("message", (e) => {
		const data = e.data;
		if (e.origin !== window.location.origin || !data || data.source !== SOURCE) return;
		let st = null;
		instances.forEach((s) => {
			if (frame_window(s) === e.source) st = s;
		});
		if (!st) return;

		if (data.type === "ready") {
			st.ready = true;
			clearTimeout(st.ready_timer);
			hide_error(st);
			show_loading(st, false);
		} else if (data.type === "unload") {
			st.ready = false;
			show_loading(st, true);
		} else if (data.type === "route") {
			show_loading(st, false);
			const route = Array.isArray(data.route) ? data.route : [];
			if (route[0] === "Form" && data.name) {
				st.current_path = norm(data.path);
				st.current_raw = String(data.path || "");
				show_empty(st, false);
				const title = data.title && data.title !== data.name ? `${data.name} · ${data.title}` : data.name;
				set_title(st, title, !!data.dirty);
			} else {
				// the pane left the form (e.g. the document was deleted)
				st.current_path = "";
				st.current_raw = "";
				set_title(st, "", false);
				show_empty(st, true);
			}
			highlight(st);
		} else if (data.type === "nav") {
			if (on_this_list(st.lv)) PV.move(st.lv, data.dir > 0 ? 1 : -1);
		}
	});

	// Alt+Up / Alt+Down on the list page
	document.addEventListener("keydown", (e) => {
		if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
		const lv = window.cur_list;
		if (!lv || !lv.__fs_pane || !lv.__fs_pane.active || !on_this_list(lv)) return;
		const tag = (document.activeElement && document.activeElement.tagName) || "";
		if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
		e.preventDefault();
		PV.move(lv, e.key === "ArrowDown" ? 1 : -1);
	});

	let resize_timer = null;
	window.addEventListener("resize", () => {
		clearTimeout(resize_timer);
		resize_timer = setTimeout(() => {
			instances.forEach((st) => st.active && update_top(st));
			const lv = window.cur_list;
			if (is_list(lv) && on_this_list(lv)) PV.sync(lv);
		}, 150);
	});

	// ------------------------------------------------------------------ settings changes
	PV.apply_settings = function (settings) {
		if (!frappe.boot) return;
		frappe.boot.fs_pane_view = Object.assign({}, cfg(), settings || {});
		const lists = frappe.views && frappe.views.list_view ? Object.values(frappe.views.list_view) : [];
		lists.forEach((lv) => {
			if (!lv || typeof lv !== "object" || !lv.doctype || !("view_name" in lv)) return;
			if (PV.enabled_for(lv.doctype)) {
				if (lv.views_list) PV.add_menu_item(lv.views_list);
				if (lv.__fs_pane && lv.__fs_pane.active) set_width(lv.__fs_pane, store.get(key(lv.doctype, "w")) || default_width(), false);
				if (lv === window.cur_list) PV.sync(lv);
			} else {
				if (lv.__fs_pane) teardown(lv.__fs_pane);
				remove_menu_item(lv);
				update_menu(lv);
			}
		});
	};

	patch();

	// Read the settings from the server quietly (no error pop-ups); one retry
	PV.fetch_settings = function (retry = 1) {
		if (!window.fetch) return Promise.resolve(null);
		return window
			.fetch("/api/method/absolute_date_time.boot.get_pane_view_settings", {
				headers: { Accept: "application/json" },
				credentials: "same-origin",
				cache: "no-store",
			})
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null)
			.then((r) => {
				if (r && r.message) {
					PV.apply_settings(r.message);
					return r.message;
				}
				if (retry > 0) {
					return new Promise((res) => setTimeout(res, 3000)).then(() => PV.fetch_settings(retry - 1));
				}
				return null;
			});
	};

	// For support: run frappe.fs_pane_view.status() in the browser console
	PV.status = function () {
		const lv = window.cur_list;
		return {
			settings: cfg(),
			list: lv ? lv.doctype : null,
			view: lv ? lv.view_name : null,
			enabled_here: lv ? PV.enabled_for(lv.doctype) : false,
			user_choice: lv ? store.get(key(lv.doctype, "on")) : null,
			active: !!(lv && lv.__fs_pane && lv.__fs_pane.active),
			pane_ready: !!(lv && lv.__fs_pane && lv.__fs_pane.ready),
			pane_error: (lv && lv.__fs_pane && lv.__fs_pane.error) || "",
			on_list_page: lv ? on_this_list(lv) : false,
			screen_width: window.innerWidth,
			wide_enough: PV.wide_enough(),
		};
	};

	$(document).on("app_ready", () => {
		patch();
		if (!frappe.boot || !frappe.boot.fs_pane_view) PV.fetch_settings();
		try {
			if (frappe.realtime && typeof frappe.realtime.on === "function") {
				frappe.realtime.on(REALTIME_EVENT, (data) => PV.apply_settings(data));
			}
		} catch (e) {
			/* realtime not available: applies on next reload */
		}
	});

	// System Settings form: tidy the values before saving (never blocks the save),
	// and apply them at once for the user who saved
	if (frappe.ui && frappe.ui.form && typeof frappe.ui.form.on === "function") {
		frappe.ui.form.on("System Settings", {
			validate(frm) {
				const d = frm.doc || {};
				if (!Object.prototype.hasOwnProperty.call(d, "enable_pane_view")) return;
				const width = parseInt(d.pane_view_list_width, 10);
				const fixed = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width || 40));
				if (fixed !== width) d.pane_view_list_width = fixed;
				const lines = String(d.pane_view_excluded_doctypes || "")
					.split("\n")
					.map((x) => x.trim())
					.filter(Boolean);
				const tidy = [...new Set(lines)].join("\n");
				if (tidy !== (d.pane_view_excluded_doctypes || "")) d.pane_view_excluded_doctypes = tidy;
			},
			after_save(frm) {
				const d = frm.doc || {};
				if (!Object.prototype.hasOwnProperty.call(d, "enable_pane_view")) return;
				const width = parseInt(d.pane_view_list_width, 10);
				PV.apply_settings({
					enabled: d.enable_pane_view ? 1 : 0,
					open_by_default: d.pane_view_open_by_default ? 1 : 0,
					width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width || 40)),
					excluded: String(d.pane_view_excluded_doctypes || "")
						.split("\n")
						.map((x) => x.trim())
						.filter(Boolean),
				});
				// then take the server's checked values (exact DocType names)
				PV.fetch_settings();
			},
		});
	}
})();
