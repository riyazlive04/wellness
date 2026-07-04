Enhance the existing Transport Management module by implementing a real-time In-App Parent Transport Notification System.

IMPORTANT

Do NOT redesign the existing Transport module.

Do NOT change the current transport workflow.

Simply extend the existing functionality.

--------------------------------------------------

FEATURE NAME

Live Transport Notifications (In-App)

--------------------------------------------------

OBJECTIVE

Parents should receive live notifications inside their Parent Dashboard whenever the school vehicle progresses from one stop to the next.

The system should automatically notify only the parents whose children belong to the upcoming stop.

The notifications should appear instantly inside the application without requiring the parent to refresh the page.

--------------------------------------------------

CURRENT WORKFLOW

Teacher selects Route

↓

Teacher clicks "Start Run"

↓

Teacher reaches each stop

↓

Teacher marks students as:

• Boarded
• Absent
• Not Boarded

↓

Teacher clicks "Advance"

↓

System moves to the next stop

This workflow should remain unchanged.

--------------------------------------------------

NEW AUTOMATION

STEP 1

When the teacher clicks "Start Run"

The system should automatically generate an in-app notification for the parents of students at the FIRST upcoming stop.

Example Notification

🚌 Transport Started

The school vehicle has started today's route.

Current Location:
School Campus

Next Stop:
Kirumampakkam

Estimated Arrival:
07:30 AM

Please ensure your child is ready at least 5 minutes before arrival.

--------------------------------------------------

STEP 2

Teacher completes Stop 1

Teacher marks:

✓ Boarded

✓ Absent

✓ Not Boarded

Teacher clicks Advance

--------------------------------------------------

AUTOMATIC ACTION

System updates:

Current Stop:
Kirumampakkam

Next Stop:
TN Palayam

Estimated Arrival:
07:45 AM

Immediately create a notification for ONLY the parents waiting at TN Palayam.

Notification

🚌 Vehicle Update

The school vehicle has departed from Kirumampakkam.

Next Stop:
TN Palayam

Expected Arrival:
07:45 AM

Please have your child ready.

--------------------------------------------------

STEP 3

Teacher advances to every stop.

Each Advance action automatically creates notifications for the NEXT stop.

Repeat until the final stop.

--------------------------------------------------

FINAL STOP

When all students have boarded,

Create a notification for all parents on that route.

Notification

✅ Route Completed

The morning pickup route has been completed successfully.

All boarded students have safely reached the school.

--------------------------------------------------

EVENING ROUTE

Apply the exact same workflow for evening drop.

Notifications should inform parents when the vehicle is approaching their drop location and when the route has been completed.

--------------------------------------------------

PARENT DASHBOARD

Create a new widget called

Live Transport Status

Display

• Vehicle Number

• Route Name

• Driver Name

• Current Stop

• Next Stop

• Estimated Arrival Time

• Route Progress

• Vehicle Status

Status values

• Waiting

• Started

• Approaching Your Stop

• Arrived at Your Stop

• Completed

--------------------------------------------------

REAL-TIME NOTIFICATIONS

Parents should receive notifications instantly.

The notification should appear

• Notification Bell

• Dashboard Notification Panel

• Toast Notification (top-right)

• Notification History

Unread notifications should display a badge count.

--------------------------------------------------

NOTIFICATION TIMELINE

Maintain a history of transport notifications.

Each notification should contain

• Route

• Vehicle

• Current Stop

• Next Stop

• Estimated Arrival

• Date

• Time

• Read / Unread Status

--------------------------------------------------

ADMIN DASHBOARD

Add a new card

Live Transport Monitoring

Display

• Running Routes

• Current Stop

• Next Stop

• Students Boarded

• Students Absent

• Students Pending

• Notifications Sent

• Route Progress

--------------------------------------------------

DATABASE

Create a Transport Notifications table.

Fields

• Notification ID

• Route ID

• Vehicle ID

• Student ID

• Parent ID

• Current Stop

• Next Stop

• Estimated Arrival Time

• Notification Title

• Notification Message

• Status (Unread / Read)


• Created At

• Read At

--------------------------------------------------

BUSINESS RULES

Only parents of the upcoming stop should receive notifications.

Do not notify all parents on the route.

Do not create duplicate notifications.

Notifications should be generated automatically every time the teacher clicks "Advance".

Notifications should be delivered instantly without requiring the parent to refresh the application.

--------------------------------------------------

EXPECTED RESULT

The existing transport workflow remains exactly the same for teachers.

As the teacher advances from one stop to the next, the system automatically generates live in-app notifications for the parents of the upcoming stop.

Parents can monitor their child's pickup or drop journey directly from their dashboard through real-time notifications and the Live Transport Status widget, creating a transparent and reliable transport communication experience.