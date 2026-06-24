// ─── HELP PAGE ────────────────────────────────────────────────
import { escHtml } from '../utils/helpers.js';

const helpTopics = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: `
      <h2>Getting Started with Waypoint</h2>
      <p>Waypoint is your funeral director workflow manager. Every family case gets its own checklist, built from a template you define. Here's how to get going:</p>
      <h3>Step 1 — Create a Template</h3>
      <p>Go to <strong>Settings → Templates</strong> and create at least one template (e.g. "In-Person Arrangement" or "Phone Arrangement"). Templates define the phases, sections, and tasks that will be copied to each new family case.</p>
      <h3>Step 2 — Add a Family</h3>
      <p>Click <strong>New Family</strong> (top right, or press <kbd>N</kbd>). Enter the decedent's name, contact information for the NOK, and select which template to apply. The checklist is automatically created from the template.</p>
      <h3>Step 3 — Work the Checklist</h3>
      <p>Open the family detail view by clicking any family card. The checklist is organized into phases (tabs). Check off items, enter field values, and add notes as you work through the case.</p>
      <div class="help-tip"><p>💡 Completed and skipped items are hidden by default — each section shows only what's left to do. Use the "Show completed" and "Show skipped" pills to reveal them.</p></div>
    `
  },
  {
    id: 'family-cases',
    title: 'Managing Family Cases',
    content: `
      <h2>Managing Family Cases</h2>
      <h3>Creating a New Case</h3>
      <p>Click New Family or press <kbd>N</kbd> from anywhere in the app. Fill in the decedent's name, date of birth and death, veteran status, NOK contact, and select a template. The checklist is built automatically.</p>
      <h3>Case Status</h3>
      <p>Every case has one of three statuses:</p>
      <ul>
        <li><strong>Active</strong> — currently in progress</li>
        <li><strong>Long Term</strong> — waiting on something that could take weeks or months (e.g. National Cemetery date). A reason field lets you note what you're waiting for.</li>
        <li><strong>Completed</strong> — case is fully closed</li>
      </ul>
      <p>Change status from the family detail header, or by clicking the status buttons at the top right of the detail view.</p>
      <h3>Veteran Flags</h3>
      <p>Check "Veteran" or "Spouse of Veteran" on the family record. These show as distinct icons on the family card — a medal ribbon for Veterans, a gold star for Veteran Spouses. The distinction matters because Veterans may receive military honors while spouses do not.</p>
      <h3>Contacts</h3>
      <p>Add as many contacts as needed. Mark one as primary (NOK). Each contact has a notes/role field — use this for important information like "Primary decision maker" or "Incapacitated — contact son James."</p>
      <h3>Case Notes</h3>
      <p>Editable from the family detail view at any time. Notes are visible directly on the family card as a preview. Quick notes can be added from the family card without opening the detail view.</p>
      <h3>Standalone Reminders</h3>
      <p>Add custom reminders to any family case — either a specific date or relative (e.g. "in 45 days"). These appear in the notification bell and the "Needs attention today" strip on the dashboard.</p>
    `
  },
  {
    id: 'checklist-basics',
    title: 'Using the Checklist',
    content: `
      <h2>Using the Checklist</h2>
      <h3>Phases (Tabs)</h3>
      <p>Checklists are organized into phases — tabbed groups of sections. Examples: Pre-Arrangement, Arrangement, Processing, Waiting & Receiving, Follow-Up. Switch between phases by clicking the tabs at the top of the checklist.</p>
      <h3>Sections</h3>
      <p>Each phase contains sections (collapsible groups of tasks). Sections can auto-collapse when all their tasks are complete. Use the collapse arrow to manually toggle any section open or closed.</p>
      <h3>Task States</h3>
      <p>Every task has three possible states:</p>
      <ul>
        <li><strong>Incomplete</strong> — default, shown with an empty checkbox</li>
        <li><strong>Complete</strong> — checked off (green), input locked but viewable</li>
        <li><strong>Skipped / N/A</strong> — greyed out with a dash, excluded from progress calculation</li>
      </ul>
      <p>Click the checkbox/state button to cycle between incomplete and complete. Use the dash (—) action button to skip an item. Skipped items can be unskipped at any time — just click the skip button again and the item returns to incomplete with its input field restored.</p>
      <h3>Show/Hide Completed and Skipped</h3>
      <p>Each section shows only incomplete items by default. The section header has small pills: "Show completed · N" and "Show skipped · N". Click them to reveal hidden items in that section. Progress totals are always shown in the header so you always know the full picture.</p>
      <h3>Progress</h3>
      <p>Progress is calculated as: completed ÷ (total − skipped). Skipped items are excluded from both the numerator and denominator, so your progress reflects only applicable tasks.</p>
      <h3>Adding Ad-Hoc Tasks</h3>
      <p>Each section has an "Add task…" input at the bottom. Type a label and press Enter or click Add to create a one-off task for that family that isn't part of the template.</p>
      <h3>Adding Sections</h3>
      <p>Click "Add Section to This Phase" at the bottom of the checklist to add a new section to the currently active phase.</p>
    `
  },
  {
    id: 'field-types',
    title: 'Field Types',
    content: `
      <h2>Checklist Field Types</h2>
      <p>Each checklist item can collect a specific type of input. Set the field type when building your template.</p>
      <h3>Checkbox</h3>
      <p>The default. Simply check or uncheck. No additional data entry.</p>
      <h3>Yes / No</h3>
      <p>Two radio options: Yes and No. Selecting either is tracked as the item's value and can trigger conditional logic (e.g. "if Veteran = Yes, show Veteran section").</p>
      <h3>Choose from List (Radio)</h3>
      <p>Custom options you define in the template (e.g. "Pickup / Mailing" or "Ordering / Bringing In"). The selected option is stored as the item's value and can trigger conditional logic.</p>
      <h3>Short Text</h3>
      <p>Single line text input. Good for names, numbers, item descriptions.</p>
      <h3>Long Text</h3>
      <p>Multi-line text area. Good for notes, instructions, or longer content.</p>
      <h3>Date</h3>
      <p>Date picker. Stores YYYY-MM-DD.</p>
      <h3>Date & Time</h3>
      <p>Date and time picker. Good for arrangement conferences, ID views, cremation schedules.</p>
      <h3>Phone Number</h3>
      <p>Formatted phone input.</p>
      <h3>Email Address</h3>
      <p>Email input.</p>
      <div class="help-tip"><p>💡 The value entered in any field can be referenced in other items using <code>{{variable_name}}</code> syntax. See "Variable References" for details.</p></div>
    `
  },
  {
    id: 'conditional-logic',
    title: 'Conditional Logic',
    content: `
      <h2>Conditional Logic</h2>
      <p>Conditional logic controls whether a checklist item or section is visible, based on the current values of other items. This is the most powerful feature of Waypoint.</p>
      <h3>How It Works</h3>
      <p>Each item and section can have one or more rules. When the rules are satisfied, the item or section becomes visible. When they're not, it stays hidden.</p>
      <h3>Trigger Conditions</h3>
      <ul>
        <li><strong>Is completed / has any value</strong> — item is checked, or any value has been entered</li>
        <li><strong>Is NOT completed / has no value</strong> — item is unchecked or empty</li>
        <li><strong>Equals value</strong> — the item's value exactly matches a specific string (e.g. "Yes", "Ordering", "Pickup Up")</li>
        <li><strong>Does not equal value</strong> — the item's value is anything other than the specified string</li>
      </ul>
      <h3>Logic Operators</h3>
      <ul>
        <li><strong>All rules (AND)</strong> — every rule must be true for the item to show</li>
        <li><strong>Any rule (OR)</strong> — at least one rule must be true for the item to show</li>
      </ul>
      <h3>Real-Time Evaluation</h3>
      <p>Logic is evaluated instantly as you enter or change values. If you select "Yes" on a Yes/No item, dependent items or sections appear immediately — no page reload needed.</p>
      <h3>Unskipping and Logic</h3>
      <p>When you unskip an item, all downstream conditional logic re-evaluates immediately. So if you unskip "Urn" which was N/A, any items that were hidden because Urn = N/A will reappear.</p>
      <h3>Cross-Section Triggers</h3>
      <p>A trigger item and its target can be in different sections. For example, a "Veteran?" Yes/No in the Arrangement section can control visibility of the entire Veteran section.</p>
      <h3>Chains</h3>
      <p>Logic can chain: Item A's value triggers Item B to appear, and Item B's completion triggers Item C. Chains are evaluated automatically — you don't need to configure them specially.</p>
      <div class="help-tip"><p>💡 Variable names are the key to conditional logic. Make sure every item that could trigger conditions has a unique, descriptive variable name (e.g. <code>veteran_status</code>, <code>urn_ordered</code>).</p></div>
    `
  },
  {
    id: 'variable-references',
    title: 'Variable References',
    content: `
      <h2>Variable References</h2>
      <p>Variable references let you display the value entered in one checklist item inside the label or helper text of another item.</p>
      <h3>Syntax</h3>
      <p>Use double curly braces around the variable name: <code>{{variable_name}}</code></p>
      <h3>Example</h3>
      <p>If you have an item labeled "Email Address" with variable name <code>email_address</code>, you can write in another item's helper text:</p>
      <p><em>"Send the Before Arrangements email to <code>{{email_address}}</code>"</em></p>
      <p>When you're working the checklist and you've entered an email address in that field, the helper text in the later item will automatically show the actual email address instead of the placeholder.</p>
      <h3>Where They Work</h3>
      <p>Variable references work in both the item's label and helper text. They update in real time as values are entered.</p>
      <h3>Setting Variable Names</h3>
      <p>Variable names are set in the template editor when editing an item. They must start with a letter and contain only lowercase letters, numbers, and underscores. Example: <code>arrangement_date</code>, <code>urn_items</code>, <code>people_authorized_to_pickup</code>.</p>
      <div class="help-tip"><p>💡 Good variable names are short but descriptive. They're automatically suggested from the item label when you create a new item.</p></div>
    `
  },
  {
    id: 'templates',
    title: 'Managing Templates',
    content: `
      <h2>Managing Templates</h2>
      <p>Templates are reusable checklist structures. When you create a new family case, you select a template and the entire checklist is copied to that case.</p>
      <h3>Template Structure</h3>
      <ul>
        <li><strong>Templates</strong> contain one or more <strong>Phases</strong></li>
        <li>Each <strong>Phase</strong> becomes a tab in the family checklist</li>
        <li>Each Phase contains one or more <strong>Sections</strong></li>
        <li>Each Section contains one or more <strong>Tasks</strong> (items)</li>
      </ul>
      <h3>Creating Templates</h3>
      <p>Go to Settings → Templates → New Template. Give it a name and description, then open the editor to add phases, sections, and tasks.</p>
      <h3>Duplicating Templates</h3>
      <p>Click Duplicate on any existing template to create an exact copy. Useful for creating a Phone Arrangement template based on your In-Person Arrangement template.</p>
      <h3>Editing Templates</h3>
      <p>You can edit templates at any time. When you save changes, you'll be asked whether to apply the changes to existing family checklists that used this template. If you say yes, new items and sections are added to those families — but items that are already answered or completed are preserved as-is, and any ad-hoc items added to individual families are kept.</p>
      <h3>Section Settings</h3>
      <p>Each section has a "Surface on card" toggle. When enabled, incomplete items from that section are shown directly on the family card on the dashboard — useful for "Waiting & Receiving" type sections where outstanding items need to be immediately visible.</p>
    `
  },
  {
    id: 'reminders',
    title: 'Reminders & Due Dates',
    content: `
      <h2>Reminders & Due Dates</h2>
      <h3>Checklist Item Due Dates</h3>
      <p>In your template, each item can have a relative due date — a number of days after the case creation date. For example, a "Payment" item might be due 5 days after case creation. When a family case is created, all relative due dates are converted to actual calendar dates.</p>
      <p>You can also set or edit absolute due dates directly on individual items within a family checklist.</p>
      <h3>Standalone Reminders</h3>
      <p>Add custom reminders to any family from the info panel in the family detail view. You can specify:</p>
      <ul>
        <li>A relative time: "in 45 days", "in 6 weeks", "in 3 months"</li>
        <li>A specific date</li>
      </ul>
      <p>Example: "In 45 days, follow up on payment status."</p>
      <h3>Notification Bell</h3>
      <p>The bell icon in the top bar shows a badge count of due and upcoming items. Click it to see all reminders grouped by family. Items are color-coded: red for overdue, amber for due today, grey for upcoming. Dismiss individually or all at once.</p>
      <h3>Needs Attention Today Strip</h3>
      <p>The dashboard shows a priority strip at the top listing all overdue and due-today items across all active families. Click any item to go directly to that family's checklist.</p>
      <h3>Dismissing Reminders</h3>
      <p>Dismissing a reminder removes it from the bell panel and strips. For standalone reminders, dismissal is permanent. For checklist item due dates, dismissal only hides the notification — the item itself is still there in the checklist.</p>
    `
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    content: `
      <h2>Keyboard Shortcuts</h2>
      <p>Waypoint supports keyboard shortcuts for faster navigation:</p>
      <ul>
        <li><kbd>/</kbd> — Focus the search bar on the current page</li>
        <li><kbd>N</kbd> — Open the New Family modal</li>
        <li><kbd>Esc</kbd> — Close the current modal, panel, or notification dropdown</li>
      </ul>
      <p>Shortcuts are disabled when you're typing in an input field.</p>
      <div class="help-tip"><p>💡 A shortcut reminder appears briefly when you first load the app.</p></div>
    `
  },
  {
    id: 'activity-log',
    title: 'Case Activity Log',
    content: `
      <h2>Case Activity Log</h2>
      <p>Every family case has an activity log — a timestamped record of everything that happened. It's append-only (you can't edit or delete entries) and loads at the bottom of the family detail view.</p>
      <h3>What Gets Logged</h3>
      <ul>
        <li>Case created</li>
        <li>Items checked, unchecked, skipped, unskipped</li>
        <li>Field values entered or changed</li>
        <li>Status changes (Active → Long Term → Completed)</li>
        <li>Case notes edited or added</li>
        <li>Sections and ad-hoc items added</li>
        <li>Contacts added</li>
        <li>Reminders added or dismissed</li>
      </ul>
      <h3>Viewing the Log</h3>
      <p>Click "Case Activity Log" at the bottom of any family detail view to expand the log. Entries show the time elapsed (e.g. "2h ago", "3d ago") alongside a description of what happened.</p>
    `
  }
];

let activeTopicId = 'getting-started';
let searchQuery = '';

export function renderHelp(params, container) {
  document.getElementById('topbar-actions').innerHTML = '';

  container.innerHTML = `
    <div style="max-width:900px">
      <div style="margin-bottom:20px">
        <div class="search-wrap" style="max-width:400px">
          <svg class="search-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="search-input" id="help-search" placeholder="Search help topics…">
        </div>
      </div>
      <div class="help-grid">
        <div class="help-nav" id="help-nav">${renderHelpNav()}</div>
        <div class="help-content card" style="padding:24px" id="help-content">${renderTopicContent(activeTopicId)}</div>
      </div>
    </div>`;

  document.getElementById('help-search')?.addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    document.getElementById('help-nav').innerHTML = renderHelpNav();
    bindNavClicks();
  });

  bindNavClicks();
}

function renderHelpNav() {
  const filtered = searchQuery
    ? helpTopics.filter(t => t.title.toLowerCase().includes(searchQuery) || t.content.toLowerCase().includes(searchQuery))
    : helpTopics;

  return filtered.map(t => `
    <div class="help-nav-item ${t.id === activeTopicId ? 'active' : ''}" data-topic="${t.id}">
      ${escHtml(t.title)}
    </div>`).join('');
}

function bindNavClicks() {
  document.querySelectorAll('.help-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      activeTopicId = item.dataset.topic;
      document.querySelectorAll('.help-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('help-content').innerHTML = renderTopicContent(activeTopicId);
    });
  });
}

function renderTopicContent(topicId) {
  const topic = helpTopics.find(t => t.id === topicId);
  if (!topic) return '<p>Topic not found.</p>';
  return topic.content;
}
