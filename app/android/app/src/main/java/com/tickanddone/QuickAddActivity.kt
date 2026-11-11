package com.tickanddone

import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.UUID

/** A launcher-owned task stays visible behind this compact, account-bound editor. */
class QuickAddActivity : Activity() {
    private lateinit var palette: NativePalette
    private lateinit var title: EditText
    private lateinit var notes: EditText
    private lateinit var metadata: TextView
    private lateinit var list: TextView
    private lateinit var dateButton: ImageButton
    private lateinit var priorityButton: ImageButton
    private lateinit var saveButton: ImageButton
    private lateinit var expandButton: ImageButton
    private lateinit var owner: String
    private var kind = "todo"
    private var itemId: String? = null
    private var draftId = UUID.randomUUID().toString()
    private var keyboardRequested = false
    private var original = JSONObject()
    private var dueAt: String? = null
    private var priority = 0
    private var rating: Double? = null
    private var done = false
    private var saving = false
    private val dialogs by lazy { NativePalette.dialogContext(this) }
    private val font by lazy { Typeface.createFromAsset(assets, "fonts/DMSans.ttf") }
    private fun dp(value: Int) = (resources.displayMetrics.density * value).toInt()

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        palette = NativePalette.current(this)
        kind = saved?.getString("kind") ?: intent.getStringExtra("kind") ?: "todo"
        if (kind !in listOf("todo", "movie")) { finish(); return }
        val repository = TickRepository.get(this)
        val snapshot = repository.snapshot()
        val active = repository.account()
        if (active == null) { startActivity(Widgets.launch(this, kind)); finish(); return }
        owner = saved?.getString("owner") ?: intent.getStringExtra("expectedAccount") ?: active
        if (owner != active) { unavailable(); return }
        itemId = saved?.getString("itemId") ?: intent.getStringExtra("id")
        draftId = saved?.getString("draftId") ?: draftId
        val wasNew = itemId == null
        val items = snapshot.getJSONObject("state").getJSONArray("items")
        val item = (0 until items.length()).map { items.getJSONObject(it) }
            .find { it.optString("id") == (itemId ?: draftId) && it.optString("kind") == kind && it.isNull("deletedAt") }
        if (wasNew && item != null) itemId = draftId
        if (itemId != null && item == null) { unavailable(); return }
        original = saved?.getString("original")?.takeUnless { wasNew && item != null }?.let { JSONObject(it) } ?: item ?: JSONObject()
        dueAt = if (saved != null) saved.getString("dueAt") else if (original.isNull("dueAt")) null else original.optString("dueAt")
        priority = saved?.getInt("priority") ?: original.optInt("priority")
        rating = if (saved != null) saved.getString("rating")?.toDoubleOrNull() else if (original.isNull("rating")) null else original.optDouble("rating")
        done = saved?.getBoolean("done") ?: original.optBoolean("done")
        setFinishOnTouchOutside(false)
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        window.setDimAmount(0.32f)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(12), dp(14), dp(10))
            background = GradientDrawable().apply {
                setColor(palette.surface); cornerRadius = dp(NativePalette.panelRadius).toFloat()
                setStroke(dp(1), palette.line)
            }
        }
        val heading = LinearLayout(this).apply { gravity = Gravity.TOP }
        title = editor("Task title", 21f, 500).apply {
            hint = if (kind == "todo") "What’s on your mind?" else "Movie or TV title"
            maxLines = 2; setText(saved?.getString("title") ?: original.optString("title"))
        }
        heading.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        expandButton = icon(R.drawable.compose_expand, "Open full editor") { save(true) }
        heading.addView(expandButton, LinearLayout.LayoutParams(dp(40), dp(40)))
        card.addView(heading)
        notes = editor("Task notes", 16f, 20000).apply {
            hint = "Description"; gravity = Gravity.TOP
            setText(saved?.getString("notes") ?: original.optString("notes"))
        }
        card.addView(notes, LinearLayout.LayoutParams(-1, 0, 1f))
        metadata = TextView(this).apply {
            typeface = font; textSize = 12f; setTextColor(palette.muted)
            setPadding(dp(4), dp(3), dp(4), dp(6))
        }
        card.addView(metadata)
        val toolbar = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        dateButton = icon(R.drawable.compose_calendar, "Due date and reminder") { pickDate() }
        priorityButton = icon(R.drawable.compose_flag, "Task priority") { pickPriority() }
        toolbar.addView(dateButton, LinearLayout.LayoutParams(dp(42), dp(44)))
        toolbar.addView(priorityButton, LinearLayout.LayoutParams(dp(42), dp(44)))
        list = TextView(this).apply {
            typeface = font; textSize = 14f; gravity = Gravity.CENTER_VERTICAL
            setTextColor(palette.accentInk)
            background = GradientDrawable().apply { setColor(palette.accent); cornerRadius = dp(7).toFloat() }
            setPadding(dp(10), 0, dp(10), 0)
            setOnClickListener { chooseList() }
        }
        toolbar.addView(list, LinearLayout.LayoutParams(-2, dp(34)).apply { marginStart = dp(6) })
        val more = icon(R.drawable.compose_more, "More task actions") { more(it) }
        toolbar.addView(more, LinearLayout.LayoutParams(dp(44), dp(44)))
        toolbar.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        saveButton = icon(R.drawable.compose_send, if (itemId == null) "Add item" else "Save changes") { save(false) }.apply { setColorFilter(palette.accentInk) }
        saveButton.background = GradientDrawable().apply { setColor(palette.accent); cornerRadius = dp(12).toFloat() }
        toolbar.addView(saveButton, LinearLayout.LayoutParams(dp(44), dp(44)))
        card.addView(toolbar)
        setContentView(card)
        val width = dp(resources.configuration.screenWidthDp - 28)
        window.setLayout(width, dp(if (resources.configuration.screenHeightDp < 700) 196 else 212))
        window.setGravity(Gravity.TOP or Gravity.CENTER_HORIZONTAL)
        window.attributes = window.attributes.apply { y = dp(20) }
        updateControls()
        title.requestFocus(); title.setSelection(title.text.length)

    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && ::title.isInitialized && !keyboardRequested) {
            keyboardRequested = true
            title.post {
                if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.show(android.view.WindowInsets.Type.ime())
                else getSystemService(InputMethodManager::class.java).showSoftInput(title, InputMethodManager.SHOW_IMPLICIT)
            }
        }
    }
    private fun unavailable() {
        Toast.makeText(this, "This account or item changed. Open your list and try again.", Toast.LENGTH_LONG).show()
        finish()
    }
    private fun editor(label: String, size: Float, limit: Int) = EditText(this).apply {
        contentDescription = label; typeface = font; textSize = size
        setTextColor(palette.ink); setHintTextColor(palette.muted)
        background = null; backgroundTintList = ColorStateList.valueOf(palette.accent)
        setPadding(dp(4), dp(9), dp(4), dp(9))
        inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        filters = arrayOf(InputFilter.LengthFilter(limit))
    }
    private fun icon(resource: Int, label: String, action: (View) -> Unit) = ImageButton(this).apply {
        setImageResource(resource); contentDescription = label; setColorFilter(palette.muted)
        setBackgroundColor(Color.TRANSPARENT); setPadding(dp(9), dp(9), dp(9), dp(9))
        setOnClickListener { if (!saving) action(it) }
    }
    private fun updateControls() {
        val movie = kind == "movie"
        notes.visibility = if (movie) View.INVISIBLE else View.VISIBLE
        dateButton.visibility = if (movie) View.GONE else View.VISIBLE
        priorityButton.setImageResource(if (movie) R.drawable.compose_star else R.drawable.compose_flag)
        priorityButton.contentDescription = if (movie) "Movie rating" else "Task priority"
        priorityButton.setOnClickListener { if (!saving) { if (kind == "movie") pickRating() else pickPriority() } }
        priorityButton.setColorFilter(if (priority > 0 || rating != null) palette.ink else palette.muted)
        dateButton.setColorFilter(if (dueAt != null) palette.ink else palette.muted)
        list.text = if (movie) "Movies" else "Todos"
        list.contentDescription = if (itemId == null) "Choose list, ${list.text}" else "List: ${list.text}"
        val details = mutableListOf<String>()
        if (movie) rating?.let { details.add("$it ★") }
        else {
            dueAt?.let { try { details.add(DateTimeFormatter.ofPattern("MMM d, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(it))) } catch (_: Exception) {} }
            if (priority > 0) details.add(listOf("None", "Low priority", "Medium priority", "High priority")[priority.coerceIn(0,3)])
        }
        if (done) details.add(if (movie) "Watched" else "Completed")
        metadata.text = details.joinToString(" · ")
        metadata.visibility = if (details.isEmpty()) View.GONE else View.VISIBLE
    }
    private fun chooseList() {
        if (itemId != null || saving) return
        AlertDialog.Builder(dialogs).setTitle("Add to")
            .setSingleChoiceItems(arrayOf("Todos", "Movies"), if (kind == "todo") 0 else 1) { dialog, which -> kind = if (which == 0) "todo" else "movie"; updateControls(); dialog.dismiss() }.show()
    }
    private fun pickPriority() {
        AlertDialog.Builder(dialogs).setTitle("Priority")
            .setSingleChoiceItems(arrayOf("None", "Low", "Medium", "High"), priority) { dialog, which -> priority = which; updateControls(); dialog.dismiss() }.show()
    }
    private fun pickRating() {
        val values = listOf<Double?>(null) + (2..10).map { it / 2.0 }
        AlertDialog.Builder(dialogs).setTitle("Your rating")
            .setSingleChoiceItems(values.map { it?.let { "$it ★" } ?: "Unrated" }.toTypedArray(), values.indexOf(rating)) { dialog, which -> rating = values[which]; updateControls(); dialog.dismiss() }.show()
    }
    private fun pickDate() {
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(title.windowToken, 0)
        val calendar = Calendar.getInstance()
        dueAt?.let { try { calendar.timeInMillis = Instant.parse(it).toEpochMilli() } catch (_: Exception) {} }
        DatePickerDialog(dialogs, { _, year, month, day ->
            TimePickerDialog(dialogs, { _, hour, minute ->
                calendar.set(year, month, day, hour, minute, 0); calendar.set(Calendar.MILLISECOND,0)
                dueAt = Instant.ofEpochMilli(calendar.timeInMillis).toString(); updateControls()
            }, calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), android.text.format.DateFormat.is24HourFormat(this)).show()
        }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
    }
    private fun more(anchor: View) {
        PopupMenu(dialogs, anchor).apply {
            menu.add("Open full editor").setOnMenuItemClickListener { save(true); true }
            if (kind == "todo" && dueAt != null) menu.add("Remove due date").setOnMenuItemClickListener { dueAt = null; updateControls(); true }
            if (itemId != null) menu.add(if (done) "Mark unfinished" else if (kind == "movie") "Mark watched" else "Mark completed").setOnMenuItemClickListener { done = !done; updateControls(); true }
            menu.add("Discard changes").setOnMenuItemClickListener { confirmClose(); true }
        }.show()
    }
    private fun patch(): JSONObject {
        val patch = JSONObject()
        fun field(key: String, value: Any?) {
            val encoded = value ?: JSONObject.NULL
            val previous = original.opt(key)
            val same = if (previous is Number && encoded is Number) previous.toDouble() == encoded.toDouble() else previous == encoded
            if (itemId == null || !same) patch.put(key, encoded)
        }
        field("title", title.text.toString().trim())
        if (kind == "todo") { field("notes", notes.text.toString()); field("dueAt", dueAt); field("priority", priority) }
        else field("rating", rating)
        if (itemId != null) field("done", done)
        return patch
    }
    private fun save(expand: Boolean, duplicateConfirmed: Boolean = false) {
        if (saving) return
        if (title.text.toString().trim().isEmpty()) { title.error = "Enter a title"; title.requestFocus(); return }
        val repository = TickRepository.get(this)
        if (repository.account() != owner) { unavailable(); return }
        val patch = patch()
        if (kind == "movie" && itemId == null && !duplicateConfirmed) {
            val items = repository.read().getJSONArray("items")
            if ((0 until items.length()).map { items.getJSONObject(it) }.any { it.optString("kind") == "movie" && it.isNull("deletedAt") && it.optString("title").equals(title.text.toString().trim(), true) }) {
                AlertDialog.Builder(dialogs).setTitle("Already on your list?").setMessage("A similar title exists. Add a separate entry?")
                    .setNegativeButton("Cancel", null).setPositiveButton("Add separate entry") { _, _ -> save(expand, true) }.show(); return
            }
        }
        if (itemId != null && patch.length() == 0) { if (expand) startActivity(Widgets.launch(this, kind, itemId)); finish(); return }
        saving = true; saveButton.isEnabled = false; expandButton.isEnabled = false; title.isEnabled = false; notes.isEnabled = false
        val request = JSONObject().put("kind", kind).put("expectedAccount", owner).put("patch", patch)
            .put("id", itemId ?: draftId).put("create", itemId == null)
        Thread {
            try {
                val result = repository.mutate(request.toString())
                val outbox = result.getJSONObject("state").getJSONArray("outbox")
                val savedId = itemId ?: outbox.getJSONObject(outbox.length()-1).getString("itemId")
                runOnUiThread { if (expand) startActivity(Widgets.launch(this, kind, savedId)); finish() }
            } catch (error: Exception) {
                runOnUiThread { saving = false; saveButton.isEnabled = true; expandButton.isEnabled = true; title.isEnabled = true; notes.isEnabled = true; title.error = error.message ?: "Could not save. Try again." }
            }
        }.start()
    }
    private fun confirmClose() {
        if (saving) return
        val changed = if (itemId == null) title.text.isNotBlank() || notes.text.isNotBlank() || dueAt != null || priority != 0 || rating != null else patch().length() > 0
        if (!changed) { finish(); return }
        AlertDialog.Builder(dialogs).setTitle("Discard these changes?").setMessage("Your saved item will stay as it was.")
            .setNegativeButton("Keep editing", null).setPositiveButton("Discard") { _, _ -> finish() }.show()
    }
    @Deprecated("Activity back callback")
    override fun onBackPressed() { confirmClose() }
    override fun onSaveInstanceState(out: Bundle) {
        out.putString("draftId", draftId); out.putString("owner", owner); out.putString("kind", kind); out.putString("itemId", itemId); out.putString("original", original.toString())
        out.putString("title", title.text.toString()); out.putString("notes", notes.text.toString()); out.putString("dueAt", dueAt)
        out.putInt("priority", priority); out.putString("rating", rating?.toString()); out.putBoolean("done", done)
        super.onSaveInstanceState(out)
    }
}
