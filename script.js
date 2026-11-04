
const $ = id => document.getElementById(id);

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
];

const STORAGE_KEY = "lecturerPlannerLectures";
const NOTIFIED_KEY = "lecturerPlannerNotified";

let lectures = loadLectures();
let notificationPermission = "default";

try {
  notificationPermission = "Notification" in window
    ? Notification.permission
    : "unsupported";
} catch {
  notificationPermission = "unsupported";
}

function loadLectures() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved.filter(item =>
      item &&
      typeof item.id === "string" &&
      typeof item.course === "string" &&
      typeof item.courseCode === "string" &&
      DAY_NAMES.includes(item.day) &&
      typeof item.startTime === "string" &&
      typeof item.endTime === "string" &&
      item.startTime < item.endTime &&
      typeof item.venue === "string" &&
      typeof item.classGroup === "string" &&
      [0, 5, 10, 15, 30, 60].includes(Number(item.reminder))
    );
  } catch {
    return [];
  }
}

function saveLectures() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lectures));
    return true;
  } catch {
    showMessage("Could not save data. Check browser storage.", true);
    return false;
  }
}

function formatTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showMessage(message, error = false) {
  $("formMessage").textContent = message;
  $("formMessage").style.color = error ? "#b91c1c" : "#15803d";
}

// Check whether two lectures overlap on the same day
function hasConflict(lecture, ignoreId = "") {
  return lectures.some(other =>
    other.id !== ignoreId &&
    other.day === lecture.day &&
    lecture.startTime < other.endTime &&
    lecture.endTime > other.startTime
  );
}

function sortLectures(items) {
  return [...items].sort((a, b) =>
    DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) ||
    a.startTime.localeCompare(b.startTime)
  );
}

function renderTimetable() {
  const filter = $("dayFilter").value;
  const items = sortLectures(
    filter === "All"
      ? lectures
      : lectures.filter(lecture => lecture.day === filter)
  );

  if (items.length === 0) {
    $("timetableBody").innerHTML = `
      <tr><td colspan="7" class="no-data">
        No lectures found. Add a lecture using the form above.
      </td></tr>`;
    return;
  }

  $("timetableBody").innerHTML = items.map(lecture => `
    <tr>
      <td>
        <div class="course-name">${escapeHTML(lecture.course)}</div>
        <div class="course-code">${escapeHTML(lecture.courseCode)}</div>
      </td>
      <td>${lecture.day}</td>
      <td>${formatTime(lecture.startTime)} – ${formatTime(lecture.endTime)}</td>
      <td>${escapeHTML(lecture.venue)}</td>
      <td>${escapeHTML(lecture.classGroup)}</td>
      <td>
        <span class="reminder-badge">
          ${lecture.reminder === 0
            ? "Off"
            : `${lecture.reminder} min`}
        </span>
      </td>
      <td>
        <div class="action-group">
          <button class="action-button edit-button"
            data-edit="${lecture.id}">Edit</button>
          <button class="action-button delete-button"
            data-delete="${lecture.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function getNextOccurrence(lecture) {
  const now = new Date();
  const target = new Date(now);
  const dayDifference =
    (DAY_NAMES.indexOf(lecture.day) - now.getDay() + 7) % 7;

  target.setDate(now.getDate() + dayDifference);

  const [hour, minute] = lecture.startTime.split(":").map(Number);
  target.setHours(hour, minute, 0, 0);

  // If today's lecture has already started, use next week.
  if (target <= now) {
    target.setDate(target.getDate() + 7);
  }

  return target;
}

function renderUpcoming() {
  const now = new Date();

  const upcoming = lectures
    .map(lecture => ({
      ...lecture,
      nextDate: getNextOccurrence(lecture)
    }))
    .sort((a, b) => a.nextDate - b.nextDate)
    .slice(0, 5);

  if (upcoming.length === 0) {
    $("upcomingLectures").innerHTML =
      '<p class="no-data">No upcoming lectures. Add your first lecture.</p>';
    return;
  }

  $("upcomingLectures").innerHTML = upcoming.map(lecture => {
    const dateLabel = lecture.nextDate.toDateString() === now.toDateString()
      ? "Today"
      : lecture.nextDate.toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric",
          month: "short"
        });

    return `
      <article class="upcoming-card">
        <div>
          <strong>${escapeHTML(lecture.course)}</strong>
          <p>${escapeHTML(lecture.courseCode)} · ${lecture.day}</p>
          <p>${escapeHTML(lecture.venue)} · ${escapeHTML(lecture.classGroup)}</p>
        </div>
        <div class="upcoming-time">
          ${dateLabel}<br>
          ${formatTime(lecture.startTime)}
        </div>
      </article>
    `;
  }).join("");
}

function updateDashboard() {
  const today = DAY_NAMES[new Date().getDay()];

  $("todayDate").textContent = formatDate(new Date());
  $("totalLectures").textContent = lectures.length;
  $("todayLectures").textContent =
    lectures.filter(lecture => lecture.day === today).length;

  $("reminderStatus").textContent =
    notificationPermission === "granted"
      ? "Enabled"
      : notificationPermission === "unsupported"
        ? "Unavailable"
        : "Off";

  renderTimetable();
  renderUpcoming();
}

// Add or update a lecture
$("lectureForm").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("lectureId").value;
  const existing = lectures.find(lecture => lecture.id === id);

  const lecture = {
    id: id || (
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2)
    ),
    course: $("course").value.trim(),
    courseCode: $("courseCode").value.trim(),
    day: $("day").value,
    venue: $("venue").value.trim(),
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    classGroup: $("classGroup").value.trim(),
    reminder: Number($("reminder").value)
  };

  if (!lecture.course || !lecture.courseCode ||
      !lecture.venue || !lecture.classGroup) {
    showMessage("Please complete all fields.", true);
    return;
  }

  if (lecture.startTime >= lecture.endTime) {
    showMessage("End time must be later than start time.", true);
    return;
  }

  if (hasConflict(lecture, id)) {
    showMessage(
      "Timetable clash: another lecture overlaps on this day.",
      true
    );
    return;
  }

  const previous = lectures;
  lectures = existing
    ? lectures.map(item => item.id === id ? lecture : item)
    : [...lectures, lecture];

  if (!saveLectures()) {
    lectures = previous;
    return;
  }

  resetForm();
  updateDashboard();
  showMessage(existing ? "Lecture updated successfully." :
    "Lecture added successfully.");
});

function resetForm() {
  $("lectureForm").reset();
  $("lectureId").value = "";
  $("formTitle").textContent = "Add a Lecture";
  $("saveButton").textContent = "Save Lecture";
  $("cancelEdit").classList.add("hidden");
  $("reminder").value = "10";
}

$("cancelEdit").addEventListener("click", resetForm);

// Handle edit and delete buttons
$("timetableBody").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (editButton) {
    const lecture = lectures.find(
      item => item.id === editButton.dataset.edit
    );

    if (!lecture) return;

    $("lectureId").value = lecture.id;
    $("course").value = lecture.course;
    $("courseCode").value = lecture.courseCode;
    $("day").value = lecture.day;
    $("venue").value = lecture.venue;
    $("startTime").value = lecture.startTime;
    $("endTime").value = lecture.endTime;
    $("classGroup").value = lecture.classGroup;
    $("reminder").value = String(lecture.reminder);

    $("formTitle").textContent = "Edit Lecture";
    $("saveButton").textContent = "Update Lecture";
    $("cancelEdit").classList.remove("hidden");

    $("lectureForm").scrollIntoView({ behavior: "smooth" });
  }

  if (deleteButton) {
    const id = deleteButton.dataset.delete;
    const lecture = lectures.find(item => item.id === id);

    if (!lecture || !confirm(`Delete ${lecture.course}?`)) return;

    const previous = lectures;
    lectures = lectures.filter(item => item.id !== id);

    if (!saveLectures()) {
      lectures = previous;
      return;
    }

    updateDashboard();
    showMessage("Lecture deleted successfully.");
  }
});

$("dayFilter").addEventListener("change", renderTimetable);

// Ask the browser for notification permission
$("enableNotifications").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showMessage("This browser does not support notifications.", true);
    return;
  }

  try {
    notificationPermission = await Notification.requestPermission();
    updateDashboard();

    showMessage(
      notificationPermission === "granted"
        ? "Reminders enabled. Keep this website open."
        : "Notifications were not enabled. Check browser permissions.",
      notificationPermission !== "granted"
    );
  } catch {
    showMessage("Could not enable notifications.", true);
  }
});

// Check for lectures that need reminders
function checkReminders() {
  if (!("Notification" in window) ||
      Notification.permission !== "granted") return;

  const now = new Date();
  let notified = {};

  try {
    notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
  } catch {
    notified = {};
  }

  for (const lecture of lectures) {
    if (lecture.reminder === 0) continue;

    const nextDate = getNextOccurrence(lecture);
    const difference = nextDate.getTime() - now.getTime();
    const reminderWindow = lecture.reminder * 60 * 1000;

    if (difference > 0 && difference <= reminderWindow) {
      const key = `${lecture.id}-${nextDate.toDateString()}`;

      if (!notified[key]) {
        try {
          new Notification("Upcoming lecture: " + lecture.course, {
            body: `${lecture.courseCode} starts at ${
              formatTime(lecture.startTime)
            }. Venue: ${lecture.venue}`,
            tag: key
          });

          notified[key] = true;
        } catch (error) {
          console.warn("Could not show lecture reminder.", error);
        }
      }
    }
  }

  try {
    // Keep recent notification records only.
    const keys = Object.keys(notified).slice(-200);
    localStorage.setItem(
      NOTIFIED_KEY,
      JSON.stringify(Object.fromEntries(keys.map(key => [key, notified[key]])))
    );
  } catch {
    // Timetable data remains usable if notification storage fails.
  }
}

updateDashboard();
checkReminders();

// Recheck periodically while the page is running.
setInterval(() => {
  updateDashboard();
  checkReminders();
}, 15000);


alert("Welcome To Lecture Timetable & Reminder WebApp");

const typingText = "My Academic Schedule";

const typingElement = document.getElementById("typing");

let index = 0;

function typeText() {
    if (typingElement && index < typingText.length) {
        typingElement.textContent += typingText.charAt(index);

        index++;

        setTimeout(typeText, 100);
    }
}

typeText();










