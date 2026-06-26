// ─── HELP DRAWER ──────────────────────────────────────────────
// Slides in from the right as an overlay drawer
// Table of contents with scrollspy

const HELP_TOPICS = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'templates', title: 'Templates' },
  { id: 'template-groups', title: 'Group Headers' },
  { id: 'template-sections', title: 'Sections' },
  { id: 'template-tasks', title: 'Tasks & Sub-tasks' },
  { id: 'field-types', title: 'Field Types' },
  { id: 'conditional-logic', title: 'Conditional Logic' },
  { id: 'variable-references', title: 'Variable References' },
  { id: 'families', title: 'Managing Families' },
  { id: 'checklist', title: 'Working the Checklist' },
  { id: 'contacts', title: 'Contacts' },
  { id: 'reminders', title: 'Reminders & Due Dates' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'dashboard', title: 'Dashboard' },
  { id: 'lost-cases', title: 'Lost Cases' },
  { id: 'appearance', title: 'Appearance & Themes' },
  { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts' },
  { id: 'activity-log', title: 'Activity Log' },
];

let drawerOpen = false;
let scrollspyObserver = null;

export function renderHelp(params, container) {
  // Help doesn't use the page container — it's a drawer overlay
  // Just open the drawer
  openHelpDrawer();
  // Navigate back to dashboard since help is a drawer
  import('../router.js').then(m => m.navigate('dashboard'));
}

export function openHelpDrawer() {
  if (drawerOpen) return;
  drawerOpen = true;

  // Create drawer
  const drawer = document.createElement('div');
  drawer.id = 'help-drawer';
  drawer.innerHTML = `
    <div class="help-backdrop" id="help-backdrop"></div>
    <div class="help-drawer-panel" id="help-drawer-panel">
      <div class="help-drawer-inner">
        <div class="help-toc" id="help-toc">
          <div class="help-toc-title">Help</div>
          <div class="help-search-wrap">
            <input class="help-search" id="help-search" placeholder="Search help…">
          </div>
          <nav class="help-toc-nav" id="help-toc-nav">
            ${HELP_TOPICS.map(t => `<a class="help-toc-item" href="#help-${t.id}" data-topic="${t.id}">${t.title}</a>`).join('')}
          </nav>
        </div>
        <div class="help-content-wrap" id="help-content-wrap">
          <button class="help-close-btn" id="help-close-btn" aria-label="Close help">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="help-content" id="help-content">
            ${HELP_TOPICS.map(t => renderTopic(t)).join('')}
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(drawer);

  // Animate in
  requestAnimationFrame(() => {
    document.getElementById('help-drawer-panel')?.classList.add('open');
  });

  // Close handlers
  document.getElementById('help-backdrop')?.addEventListener('click', closeHelpDrawer);
  document.getElementById('help-close-btn')?.addEventListener('click', closeHelpDrawer);

  // TOC clicks → smooth scroll
  document.querySelectorAll('.help-toc-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const topic = link.dataset.topic;
      document.getElementById(`help-${topic}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Search filter
  document.getElementById('help-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.help-toc-item').forEach(item => {
      item.style.display = !q || item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    if (!q) {
      document.querySelectorAll('.help-section').forEach(s => s.style.display='');
    } else {
      document.querySelectorAll('.help-section').forEach(s => {
        const matches = s.textContent.toLowerCase().includes(q);
        s.style.display = matches ? '' : 'none';
      });
    }
  });

  // Scrollspy
  initScrollspy();
}

function closeHelpDrawer() {
  if (!drawerOpen) return;
  const panel = document.getElementById('help-drawer-panel');
  panel?.classList.remove('open');
  if (scrollspyObserver) { scrollspyObserver.disconnect(); scrollspyObserver = null; }
  setTimeout(() => {
    document.getElementById('help-drawer')?.remove();
    drawerOpen = false;
  }, 320);
}

function initScrollspy() {
  const contentWrap = document.getElementById('help-content-wrap');
  if (!contentWrap) return;
  const sections = document.querySelectorAll('.help-section');
  scrollspyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('help-','');
        document.querySelectorAll('.help-toc-item').forEach(item => {
          item.classList.toggle('active', item.dataset.topic === id);
        });
        // Scroll TOC to keep active item visible
        const activeItem = document.querySelector(`.help-toc-item[data-topic="${id}"]`);
        activeItem?.scrollIntoView({ block: 'nearest' });
      }
    });
  }, { root: contentWrap, threshold: 0.3 });
  sections.forEach(s => scrollspyObserver.observe(s));
}

function renderTopic(topic) {
  const content = HELP_CONTENT[topic.id] || '<p>Content coming soon.</p>';
  return `<div class="help-section" id="help-${topic.id}">
    <h2 class="help-section-title">${topic.title}</h2>
    ${content}
  </div>`;
}

const HELP_CONTENT = {
  'getting-started': `
    <p>Waypoint is a workflow management app built specifically for funeral directors. It replaces paper checklists with a digital system that tracks every case from first call through final follow-up.</p>
    <h3>Quick start</h3>
    <ol style="padding-left:18px;margin-bottom:12px">
      <li style="margin-bottom:6px;font-size:.82rem">Go to <strong>Settings → Templates</strong> and create at least one template (e.g. "In-Person Arrangement")</li>
      <li style="margin-bottom:6px;font-size:.82rem">Click the <strong>+ floating button</strong> (bottom right) to create a new family case</li>
      <li style="margin-bottom:6px;font-size:.82rem">Select your template — the checklist is built automatically</li>
      <li style="margin-bottom:6px;font-size:.82rem">Work through the checklist, checking off tasks and entering information as you go</li>
    </ol>
    <div class="help-tip">💡 The global search bar in the top nav lets you find any family instantly by name, contract number, or contact info.</div>`,

  'templates': `
    <p>Templates are reusable checklist structures. When you create a new family case, you select a template and Waypoint copies the entire checklist — all groups, sections, tasks, and sub-tasks — to that case.</p>
    <p>You can create as many templates as you need. Common examples: <em>In-Person Arrangement</em> and <em>Phone Arrangement</em>. The template name appears on each family card so you can tell at a glance how the arrangement was handled.</p>
    <h3>Creating a template</h3>
    <p>Go to <strong>Settings → Templates → New Template</strong>. Give it a name and description, then click Edit to open the template editor.</p>
    <h3>Duplicating a template</h3>
    <p>Click <strong>Duplicate</strong> on any template to create an exact copy. Useful for creating a Phone template based on your In-Person template with minor modifications.</p>
    <div class="help-tip">💡 Changes to a template do NOT affect existing family checklists. Each family case gets its own independent copy of the checklist at creation time.</div>`,

  'template-groups': `
    <p>Group headers are the top-level organizers in your checklist — bold dark banners that divide the checklist into major phases. Examples: <strong>PRE-ARRANGEMENT</strong>, <strong>ARRANGEMENT</strong>, <strong>POST-ARRANGEMENT</strong>.</p>
    <p>In the template editor, click <strong>+ Add Group Header</strong> to create one. Give it a name in all caps for visual clarity.</p>
    <h3>Direct tasks on a group</h3>
    <p>You can add tasks directly to a group header without creating a section first. These appear directly under the group header banner. This is ideal for tasks that don't belong to a specific section — like "Convert contract" or "Send before arrangements email."</p>
    <h3>Reordering groups</h3>
    <p>Drag the handle icon on the left of any group header to reorder them. The order in the template becomes the order in the live checklist.</p>`,

  'template-sections': `
    <p>Sections live inside group headers and provide a second level of organization. They're collapsible blocks with their own progress tracking. Examples: <strong>Compass</strong>, <strong>Documents</strong>, <strong>Waiting & Receiving</strong>.</p>
    <p>Sections are optional — not every group needs sections. You can mix direct tasks and sections within the same group.</p>
    <h3>Section settings</h3>
    <p>Click the gear icon on any section to access its settings:</p>
    <ul>
      <li><strong>Surface on card</strong> — When enabled, incomplete tasks from this section appear directly on the family card on the dashboard. Useful for "Waiting" type sections where outstanding items need immediate visibility.</li>
      <li><strong>Conditional logic</strong> — Show or hide this section based on the values of other tasks.</li>
    </ul>`,

  'template-tasks': `
    <p>Tasks are the individual checklist items. Every task has a checkbox — that's how you mark it complete. Optionally, a task can also have a field type to capture specific information.</p>
    <h3>Adding tasks</h3>
    <p>In the template editor, type in the "Add task…" input at the bottom of any section or group and press Enter. The task is added immediately.</p>
    <h3>Sub-tasks</h3>
    <p>Any task can have sub-tasks — a second level of items nested beneath it. Sub-tasks work exactly like tasks: they have checkboxes, optional field types, and conditional logic.</p>
    <p><strong>Important:</strong> When a task has sub-tasks, the progress count tracks the sub-tasks — not the parent task itself. Completing all sub-tasks automatically completes the parent task.</p>
    <h3>Task settings</h3>
    <p>Click the pencil icon on any task to edit its settings:</p>
    <ul>
      <li><strong>Label</strong> — The task name shown on the checklist</li>
      <li><strong>Helper text</strong> — Instruction or context shown below the label. Supports {{variable}} references.</li>
      <li><strong>Field type</strong> — Optional. Only set if this task needs to capture information.</li>
      <li><strong>Variable name</strong> — Used to reference this task's value in other tasks. Auto-generated but editable.</li>
      <li><strong>Mark as important</strong> — Important tasks show on the family card and in the attention strip at the top of the checklist.</li>
      <li><strong>Due days</strong> — Number of days after case creation when this task is due.</li>
      <li><strong>Conditional logic</strong> — Show or hide this task based on other values.</li>
    </ul>
    <h3>Reordering tasks</h3>
    <p>Drag the handle icon on the left of any task to reorder it within its section or group.</p>`,

  'field-types': `
    <p>Field types are optional additions to tasks that let you capture specific information. Every task already has a checkbox — you only need to set a field type if the task requires additional data entry.</p>
    <h3>Available field types</h3>
    <ul>
      <li><strong>Yes / No</strong> — Two radio buttons. Good for veteran status, embalming authorization, etc.</li>
      <li><strong>Choose from list (Radio)</strong> — Custom options you define. Good for 2–4 choices like disposition type.</li>
      <li><strong>Dropdown</strong> — Same as radio but displayed as a dropdown. Better for longer option lists.</li>
      <li><strong>Short Text</strong> — Single line text input. Good for names, tracking numbers, brief notes.</li>
      <li><strong>Long Text</strong> — Multi-line text area. Good for detailed notes or instructions.</li>
      <li><strong>Number</strong> — Numeric input. Good for quantities.</li>
      <li><strong>Currency ($)</strong> — Dollar amount input with formatting.</li>
      <li><strong>Death Certificate Quantity</strong> — Two paired number inputs: Long form and Short form. Designed specifically for DC ordering.</li>
      <li><strong>Date</strong> — Date picker.</li>
      <li><strong>Date & Time</strong> — Date and time picker. Good for arrangement conferences, ID views, cremation schedules.</li>
      <li><strong>Phone Number</strong> — Automatically formats as (555) 555-5555 as you type.</li>
      <li><strong>Email Address</strong> — Email input.</li>
    </ul>
    <div class="help-tip">💡 Only set a field type if you actually need to capture data. Most tasks are just checkboxes with no additional input needed.</div>`,

  'conditional-logic': `
    <p>Conditional logic controls whether a task or section is visible, based on the values entered in other tasks. This lets your checklist adapt dynamically to each case.</p>
    <h3>How it works</h3>
    <p>You set up rules on a task or section that say "show this item only when [other task] [condition]." The checklist evaluates these rules in real time as you enter information.</p>
    <h3>Available conditions</h3>
    <ul>
      <li><strong>Is completed</strong> — The trigger task has been checked off or has any value entered</li>
      <li><strong>Is not completed</strong> — The trigger task is unchecked or empty</li>
      <li><strong>Equals</strong> — The trigger task's value exactly matches a specific text (e.g. "Yes", "Cremation")</li>
      <li><strong>Does not equal</strong> — The trigger task's value is anything other than the specified text</li>
    </ul>
    <h3>Logic operators</h3>
    <ul>
      <li><strong>All (AND)</strong> — Every rule must be true for the item to show</li>
      <li><strong>Any (OR)</strong> — At least one rule must be true for the item to show</li>
    </ul>
    <h3>Setting up conditional logic</h3>
    <p>Click the pencil icon on any task in the template editor and scroll to the Conditional Logic section. Click "+ Add condition" and select a trigger task and condition.</p>
    <div class="help-tip">💡 The trigger task must have a variable name set. Only tasks with variable names appear in the trigger dropdown.</div>
    <h3>Example</h3>
    <p>You have a "Veteran?" Yes/No task with variable name <code>veteran</code>. On the "DD-214" task, you set a condition: show when <code>veteran</code> equals <code>Yes</code>. The DD-214 task only appears when you select Yes on the veteran question.</div>`,

  'variable-references': `
    <p>Variable references let you display information entered in one task inside the helper text of another task. This is how information flows through the checklist.</p>
    <h3>Syntax</h3>
    <p>Use double curly braces around the variable name: <code>{{variable_name}}</code></p>
    <h3>Example</h3>
    <p>During the arrangement, you have a "Death Certificates" task with field type DC Quantity and variable name <code>dc_qty</code>.</p>
    <p>Later, in the Ordering section, you have an "Order death certificates" task with helper text:</p>
    <p><em>Order certificates — <code>{{dc_qty}}</code></em></p>
    <p>When you're in the ordering stage, the helper text automatically shows the quantities you entered during the arrangement conference.</p>
    <h3>Inserting references in the template editor</h3>
    <p>When editing a task's helper text, click <strong>{ } Insert ref</strong> to see a dropdown of all available variables. Click any variable to insert it at the cursor position. Only tasks that capture data (with a field type set) appear in this list.</p>
    <h3>Variable names</h3>
    <p>Variable names are auto-generated from the task label when you create it. You can edit them in task settings. They must start with a letter and contain only lowercase letters, numbers, and underscores.</p>`,

  'families': `
    <p>Each family case represents one decedent and their associated workflow. Cases are created from a template and contain an independent copy of the checklist.</p>
    <h3>Creating a family case</h3>
    <p>Click the <strong>+ button</strong> (bottom right corner, always visible) to open the New Family modal. Fill in:</p>
    <ul>
      <li>Decedent name (first, middle, last)</li>
      <li>Date of birth and date of death</li>
      <li>Arrangement date and time</li>
      <li>Contract number</li>
      <li>Veteran / Spouse of Veteran status</li>
      <li>Primary contact (NOK) name, relationship, phone, email</li>
      <li>Template to use</li>
      <li>Initial status (Active or Long Term)</li>
      <li>Case notes</li>
    </ul>
    <h3>Case statuses</h3>
    <ul>
      <li><strong>Active</strong> — Case is currently in progress</li>
      <li><strong>Long Term</strong> — Case is waiting on something that could take weeks or months (National Cemetery date, etc.). A reason field lets you note what you're waiting for.</li>
      <li><strong>Completed</strong> — Case is fully closed</li>
      <li><strong>Lost</strong> — Family chose another provider. Lost cases are sub-categorized under Completed.</li>
    </ul>
    <h3>Editing family info</h3>
    <p>Click the pencil icon next to the decedent name in the family detail header to edit name, dates, arrangement time, contract number, and veteran status.</p>`,

  'checklist': `
    <p>The checklist is the heart of Waypoint. It's a scrollable, two-column list of everything that needs to happen for a case.</p>
    <h3>Checking off tasks</h3>
    <p>Click the checkbox on the left of any task to mark it complete. Click again to uncheck. The task turns grey and collapsed when completed.</p>
    <h3>Sub-tasks</h3>
    <p>Tasks with sub-tasks show a chevron (▼) next to the label. Click it to expand or collapse the sub-tasks. Completing all sub-tasks automatically completes the parent task. You can still expand a completed parent to uncheck a sub-task if needed.</p>
    <h3>Skipping tasks</h3>
    <p>Click the dash (—) button on any task to mark it as N/A (skipped). Skipped tasks are excluded from the progress count. Click the dash again to restore a skipped task.</p>
    <h3>Important tasks</h3>
    <p>Click the star (☆) button on any task to mark it as important. Important tasks appear in the attention strip at the top of the checklist and on the family card on the dashboard.</p>
    <h3>Completed and skipped items visibility</h3>
    <p>By default, only incomplete tasks are shown. Use the "X done" and "X skipped" toggle pills on each section header to reveal completed or skipped items.</p>
    <h3>Adding one-off tasks</h3>
    <p>Each section and group has an "Add task…" input at the bottom for adding case-specific tasks that aren't in your template.</p>
    <h3>Two-column layout</h3>
    <p>The checklist splits into two columns automatically. Items flow left column first, then right, maintaining their template order.</p>`,

  'contacts': `
    <p>Each family case can have multiple contacts. One is designated as the Primary Contact (NOK).</p>
    <h3>Adding contacts</h3>
    <p>The primary contact (NOK) is added when creating the family case. Additional contacts can be added from the family detail sidebar using the <strong>Add Contact</strong> button.</p>
    <h3>Editing contacts</h3>
    <p>Click the pencil icon next to any contact in the sidebar to edit their name, relationship, phone, email, and role notes.</p>
    <h3>Changing primary contact</h3>
    <p>If circumstances change and a different person becomes the primary decision maker, click <strong>Make Primary</strong> on any additional contact. This promotes them to primary and demotes the current primary to an additional contact.</p>
    <h3>Role notes</h3>
    <p>Use the role notes field for important flags like "Primary decision maker", "Incapacitated — contact son James", or "Do not call before 9am". These appear in coral text below the contact info as a reminder.</p>`,

  'reminders': `
    <p>Reminders alert you to time-sensitive tasks and upcoming events.</p>
    <h3>Task due dates</h3>
    <p>In the template, each task can have a relative due date — a number of days after case creation. When a case is created, these become actual calendar dates. You can also set or edit due dates directly on individual tasks in the live checklist.</p>
    <h3>Standalone reminders</h3>
    <p>Add custom reminders to any case from the family detail sidebar. Specify either a relative time ("in 45 days") or a specific date. Examples: "Follow up on payment in 30 days", "Check on DC signing".</p>
    <h3>Arrangement reminders</h3>
    <p>When you set an arrangement date and time, a banner automatically appears on the dashboard for upcoming arrangements — color coded by timing: coral for today, amber for tomorrow, blue for this week.</p>
    <h3>Datetime field reminders</h3>
    <p>When you enter a date/time value in a checklist task, a "Set reminder" option appears so you can create a reminder directly from that value.</p>`,

  'notifications': `
    <p>The bell icon in the top nav shows a count of upcoming and overdue items. Click it to see all reminders.</p>
    <h3>Grouping</h3>
    <p>Notifications are grouped by timing:</p>
    <ul>
      <li><strong>Overdue</strong> — Past due date</li>
      <li><strong>Due Today</strong> — Due today</li>
      <li><strong>Due Tomorrow</strong> — Due tomorrow</li>
      <li><strong>Due This Week</strong> — Due within 7 days</li>
      <li><strong>Upcoming</strong> — Further out</li>
    </ul>
    <h3>Dismissing reminders</h3>
    <p>Click "dismiss" on any notification to remove it from the bell panel. For standalone reminders, this is permanent. For task due dates, the task is still there in the checklist — only the notification is dismissed.</p>
    <h3>Dismiss all</h3>
    <p>Click "Dismiss all" in the bell panel header to clear all notifications at once.</p>`,

  'dashboard': `
    <p>The dashboard is your home view showing all active and closed cases.</p>
    <h3>Active vs Closed cases</h3>
    <p>Use the <strong>Active Cases / Closed Cases dropdown</strong> to switch between views. Active Cases (Active + Long Term) shows family cards. Closed Cases (Completed + Lost) shows a compact list view.</p>
    <h3>Stats bar</h3>
    <p>The compact stats bar at the top shows counts for Active, Long Term, Completed, Lost, and All cases at a glance.</p>
    <h3>Filter chips</h3>
    <p>In Active Cases: filter by All, Active, or Long Term. In Closed Cases: filter by All, Completed, or Lost.</p>
    <h3>Sorting</h3>
    <p>Sort by Newest, Oldest, Last Updated, Name A–Z, or Arrangement Date. Click the ↓ button to reverse the sort direction.</p>
    <h3>Family cards</h3>
    <p>Each active case card shows: decedent name, DOD, contract number, arrangement date/time, template used, primary contact, progress bar, important items needing attention, and the next incomplete task. Click any card to open the full case.</p>
    <h3>Quick notes</h3>
    <p>Click "Quick note" at the bottom of any family card to add a note without opening the full case.</p>
    <h3>Priority strip</h3>
    <p>Overdue and due-today items appear in a coral strip below the stats bar. Click any item to go directly to that family's checklist.</p>`,

  'lost-cases': `
    <p>When a family chooses another funeral home or otherwise doesn't proceed, you can mark the case as lost rather than completed.</p>
    <h3>Marking as lost</h3>
    <p>From the family detail header, click the <strong>⊘ Lost</strong> button. A modal asks you to select a reason:</p>
    <ul>
      <li>Chose another funeral home</li>
      <li>Price / cost concerns</li>
      <li>Family changed plans</li>
      <li>Pre-arrangement cancelled</li>
      <li>Other (with custom reason field)</li>
    </ul>
    <p>The case is moved to Completed status with the lost flag and reason recorded.</p>
    <h3>Viewing lost cases</h3>
    <p>On the dashboard, switch to <strong>Closed Cases</strong> and filter by <strong>Lost</strong> to see only lost cases. The lost reason appears in the list view.</p>
    <h3>Stats tracking</h3>
    <p>The <strong>Lost</strong> stat in the stats bar tracks total lost cases over time, giving you visibility into retention patterns.</p>`,

  'appearance': `
    <p>Waypoint supports 10 color themes that change the overall color of the app — navigation, buttons, accents, progress bars, and more.</p>
    <h3>Changing theme</h3>
    <p>Go to <strong>Settings → Appearance</strong> and click any theme swatch. The theme applies instantly and is saved to your account, so it persists across devices and sessions.</p>
    <h3>Available themes</h3>
    <ul>
      <li>Forest (teal/green — default)</li>
      <li>Ocean (blue)</li>
      <li>Violet (purple)</li>
      <li>Midnight (dark navy)</li>
      <li>Crimson (deep red)</li>
      <li>Warm (amber/brown)</li>
      <li>Rose (pink)</li>
      <li>Emerald (deep green)</li>
      <li>Slate (blue-grey)</li>
      <li>Graphite (neutral dark grey)</li>
    </ul>`,

  'keyboard-shortcuts': `
    <p>Waypoint supports keyboard shortcuts to speed up common actions.</p>
    <ul>
      <li><kbd>N</kbd> — Open the New Family modal (when not typing in an input)</li>
      <li><kbd>Esc</kbd> — Close the current modal, notification panel, or search dropdown</li>
    </ul>
    <p>The global search bar in the top nav is always accessible with a click.</p>`,

  'activity-log': `
    <p>Every family case has an append-only activity log that records everything that happens.</p>
    <h3>What gets logged</h3>
    <ul>
      <li>Case created</li>
      <li>Tasks checked, unchecked, skipped, unskipped</li>
      <li>Sub-tasks checked, unchecked, skipped</li>
      <li>Parent task auto-completed (when all sub-tasks done)</li>
      <li>Field values entered or changed</li>
      <li>Status changes (Active → Long Term → Completed → Lost)</li>
      <li>Case notes edited or quick notes added</li>
      <li>Sections and ad-hoc tasks added</li>
      <li>Contacts added or edited</li>
      <li>Reminders added or dismissed</li>
      <li>Important flag toggled</li>
    </ul>
    <h3>Viewing the log</h3>
    <p>Click <strong>Case Activity Log</strong> at the bottom of any family detail view to expand it. Entries show how long ago the action occurred (e.g. "2h ago", "3d ago") alongside a description.</p>
    <p>The log is read-only and cannot be edited or deleted.</p>`
};
