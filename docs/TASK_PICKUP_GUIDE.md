# How to Pick Up a Task in Orbit

This guide explains how employees and contractors can find, accept, and complete tasks in Orbit.

## Finding Available Tasks

### Task Board

1. Navigate to **Tasks** from the main navigation
2. The task board shows tasks organized by status columns:
   - **Open** - Available tasks you can accept
   - **Assigned** - Tasks assigned but not started
   - **In Progress** - Tasks currently being worked on
   - **Completed** - Tasks submitted for review
   - **Approved** - Tasks that passed QC review

### Filtering Tasks

Use the filter panel to narrow down tasks:
- **Status** - Filter by task status
- **Project** - Show tasks from specific projects
- **Urgency** - Filter by urgency multiplier
- **Required Level** - Filter by skill level requirements
- **Deadline** - Filter by due date range

## Accepting a Task

### Requirements

Before accepting a task, ensure:
- Your **training level** meets or exceeds the task's required level
- The task status is **Open**
- You have capacity to take on additional work

### Steps to Accept

1. **Browse Open Tasks**
   - Go to the Tasks page
   - Look at the "Open" column on the board view, or filter by status

2. **Review Task Details**
   - Click on a task card to view full details
   - Review the description, requirements, and deadline
   - Check the task value and any urgency bonuses

3. **Accept the Task**
   - Click the **"Accept Task"** button
   - The task moves to "Assigned" status and is now yours

## Working on a Task

### Starting Work

1. From the task detail page, click **"Start Work"**
2. The task status changes to "In Progress"
3. You can now begin adding artifacts and notes

### Adding Proof of Completion

While working, add artifacts to document your work:

1. **Add Files**
   - Click "Add Artifact" button
   - Select the "Files" tab
   - Drag and drop or click to upload screenshots, documents, etc.
   - Max file size: 10 MB per file

2. **Add GitHub PRs**
   - Click "Add Artifact" button
   - Select the "GitHub PR" tab
   - Paste the PR URL (e.g., `https://github.com/owner/repo/pull/123`)
   - The system automatically parses the PR details

3. **Add External URLs**
   - Click "Add Artifact" button
   - Select the "URL" tab
   - Enter the URL and optional title
   - Use this for documentation links, deployed previews, etc.

### Draft Auto-Save

- Your artifacts and notes are automatically saved as a draft
- Look for the "Saved at [time]" indicator
- You can leave and return without losing work

## Submitting Work

### Pre-Submission Checklist

Before submitting, verify:
- [ ] All required work is complete
- [ ] Code is tested and working
- [ ] Relevant artifacts are attached (screenshots, PRs, etc.)
- [ ] Submission notes describe what was done

### Submitting for Review

1. Ensure all artifacts are added
2. Write clear submission notes explaining:
   - What was completed
   - Any challenges encountered
   - Notes for the reviewer
3. Click **"Submit Work"** button
4. Review the summary in the confirmation modal
5. Click **"Submit for Review"**

### What Happens Next

1. Your task moves to "Completed" status
2. An AI review is automatically triggered
3. QC reviewers will evaluate your submission
4. You'll receive feedback if changes are needed
5. Once approved, the task moves to "Approved" and you earn the task value

## Task Value & Compensation

### Base Value
Each task has a **dollar value** shown on the task card and detail page.

### Urgency Multiplier
Tasks may have urgency bonuses:
- No bonus: 1.0x (base value)
- Low urgency: 1.1x (+10%)
- Medium urgency: 1.25x (+25%)
- High urgency: 1.5x (+50%)

### Your Compensation
Your earnings depend on your salary/task ratio (r):
- Higher r = more base salary, less task-based pay
- Lower r = less base salary, more task-based pay
- Adjust this in Settings under "Salary Mixer"

## Tips for Success

1. **Start with appropriate tasks** - Choose tasks matching your skill level
2. **Document thoroughly** - Add screenshots and notes for smoother reviews
3. **Meet deadlines** - Urgency bonuses reward timely completion
4. **Learn from feedback** - QC reviews help improve your work quality
5. **Build your level** - Complete tasks to increase your training level and access higher-value work

## Troubleshooting

### "Level requirement not met"
Your training level is below the task's required level. Complete more tasks at your current level to advance.

### "Task is assigned to someone else"
Another user accepted this task first. Look for other open tasks.

### Upload failed
- Check file size (max 10 MB)
- Ensure stable internet connection
- Try a different file format if needed

### Submission rejected
- Review QC feedback carefully
- Make requested changes
- The task returns to "In Progress" for you to fix and resubmit
