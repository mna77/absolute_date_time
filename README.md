## Absolute Date Time

Two Desk features for every DocType, each switched on in **System Settings**.

### 1. Absolute Date and Time

Checkbox **Absolute Date and Time** (Date and Number Format section, under Time Format).

When it is ticked, every timestamp in the **Activity** section of every document shows the exact date and time before the relative time:

    You created this · 14-11-2026 23:36:27 (9 hours ago)

- Works for all DocTypes (standard and custom). No per-DocType client script is needed.
- Uses each user's Date Format, Time Format and Time Zone.
- The relative part ("9 hours ago") still updates every minute.
- Only the Activity section is changed. List views, notifications and reports stay as they are.

### 2. Pane View

Section **Pane View** (at the end of System Settings):

| Setting | Meaning |
| --- | --- |
| Enable Pane View | Adds **Pane View** to the view switcher (List View menu) of every DocType |
| Open Lists in Pane View by Default | Lists open in Pane View until a user switches back; each user's choice per DocType is remembered |
| Default List Width (%) | 20 to 80, default 40 |
| Disable Pane View for These DocTypes | One DocType per line. Any letter case works; unknown names are ignored |

In Pane View the list stays on the left and the selected document opens on the right as the normal, live form. You can edit, save, submit and print there, and realtime updates work.

- **Divider:** drag it to resize. Double-click it to go back to the default width, or use the Left/Right arrow keys when it has focus. Each user's width is remembered per DocType.
- **Pane toolbar:** Previous, Next, Reload, Open full page, Open in new tab, Close Pane View.
- **Keyboard:** Alt+Down and Alt+Up open the next and previous document, from the list or from inside the pane.
- **Normal clicks still work:** Ctrl/Cmd+click, checkboxes, likes and filter links behave as usual.
- **Unsaved changes:** if the document in the pane has unsaved changes, you are asked before another document replaces it or the pane closes.
- **Narrow screens:** below 992 px wide, the normal list layout is used. Widening the window brings the pane back.
- **Problems are explained:** if the server refuses to show pages in a frame, the session has expired, or a document takes too long to open, the pane says so and offers Try again and Open full page.
- **No view switcher:** if a user's role hides the view switcher, Pane View is offered in the list's ⋯ menu instead.
- **Support check:** run `frappe.fs_pane_view.status()` in the browser console on a list page to see why the pane is or isn't showing.
- **Other views:** only List View gets a pane. Report, Kanban, Calendar and Gantt are unchanged. Choosing Pane View from Report View opens the list in Pane View.

Nothing from this app runs while System Settings is saved, so it can never block a save. The user who saves sees the change at once; other users see it after their next page reload.

Tested against Frappe v14 and v15.

### Install or update

```bash
cd ~/frappe-bench
bench get-app https://github.com/<your-account>/absolute_date_time   # or: cd apps/absolute_date_time && git pull
bench --site <your-site> install-app absolute_date_time            # first install only
bench --site <your-site> migrate                                   # creates / updates the System Settings fields
bench build --app absolute_date_time
bench --site <your-site> clear-cache
bench restart        # production (supervisor); skip in development
```

### Uninstall

```bash
bench --site <your-site> uninstall-app absolute_date_time
```

This removes all fields the app added to System Settings and their saved values.

#### License

MIT
