import asyncio
import aiosqlite
import json

demoSteps = [
    {
        "url": 'dcsa_dashboard',
        "text": "Welcome to the Defense Counter Intelligence and Security Agency portal. This automated tour will guide you through our four core mission objectives and our long-term strategic priorities.",
        "actions": [
            { "time": 2000, "type": 'scroll', "value": 300 },
            { "time": 7000, "type": 'scroll', "value": 'top' },
            { "time": 9000, "type": 'custom', "fn": 'highlight_personnel' }
        ]
    },
    {
        "url": 'dcsa_personnel_vetting',
        "text": "Our first objective: Personnel Vetting. Here, we conduct background investigations and continuous vetting for the federal government. Using the advanced search interface, you can filter cases by Name, Case ID, Status, or Assigned Agent. Let's search by Name. Selecting an individual case ID reveals their comprehensive clearance timeline and assigned risk analysts. We will now select a case, scroll through their details, and securely open a classified document artifact.",
        "actions": [
            { "time": 4000, "type": 'scroll', "value": 400 },
            { "time": 9000, "type": 'custom', "fn": 'highlight_search' },
            { "time": 14000, "type": 'select', "selector": '#search-criteria', "value": 'name' },
            { "time": 15000, "type": 'type', "selector": '#search-last-name', "value": 'S' },
            { "time": 16000, "type": 'click', "selector": 'button[onclick="executeSearch()"]' },
            { "time": 18000, "type": 'scroll', "value": 800 },
            { "time": 20000, "type": 'click', "selector": 'tbody tr:first-child a[onclick*="showSubject"]' },
            { "time": 23000, "type": 'scrollModal', "selector": '#subject-modal', "value": 400 },
            { "time": 26000, "type": 'click', "selector": '#subj-timeline a[onclick*="openArtifact"]' },
            { "time": 28000, "type": 'type', "selector": '#classified-password', "value": 'admin' },
            { "time": 30000, "type": 'click', "selector": '#password-modal button[onclick="submitPassword()"]' },
            { "time": 33000, "type": 'click', "selector": '#artifact-modal button[onclick="closeArtifactModal()"]' },
            { "time": 34500, "type": 'click', "selector": '#subject-modal button[onclick="closeSubjectModal()"]' }
        ]
    },
    {
        "url": 'dcsa_industrial_security',
        "text": "Our second objective: Industrial Security. This team oversees cleared defense contractors. The advanced facility search features a dropdown to query by Contractor Name, CAGE code, Region, Facility Clearance Status, or Agent Assigned. We will now open a facility profile to view their compliance rates, active cyber infractions, and Security Compliance Review details. You can review the ten step clearance process and view compliance artifacts.",
        "actions": [
            { "time": 3000, "type": 'scroll', "value": 400 },
            { "time": 8000, "type": 'custom', "fn": 'highlight_search' },
            { "time": 13000, "type": 'select', "selector": '#search-criteria', "value": 'name' },
            { "time": 14000, "type": 'type', "selector": '#search-name', "value": 'L' },
            { "time": 15000, "type": 'click', "selector": 'button[onclick="executeSearch()"]' },
            { "time": 16000, "type": 'scroll', "value": 800 },
            { "time": 18000, "type": 'click', "selector": 'tbody tr:first-child a[onclick*="showFacility"]' },
            { "time": 20000, "type": 'scrollModal', "selector": '#facility-modal', "value": 400 },
            { "time": 24000, "type": 'click', "selector": '#fac-steps-tbody tr:first-child' },
            { "time": 27000, "type": 'click', "selector": '#artifact-modal button[onclick="closeArtifactModal()"]' },
            { "time": 29000, "type": 'click', "selector": '#facility-modal button[onclick="closeFacilityModal()"]' }
        ]
    },
    {
        "url": 'dcsa_counterintelligence',
        "text": "Our third objective: Counterintelligence. This team actively monitors foreign intelligence entities. The incident search dropdown enables filtering by Incident ID, Vector, Risk Level, or Assigned Agent. Authorized personnel can drill down into specific Suspicious Contact Reports, known as S C Rs, to review detailed descriptions, mitigation strategies, and case actions.",
        "actions": [
            { "time": 3000, "type": 'scroll', "value": 400 },
            { "time": 8000, "type": 'custom', "fn": 'highlight_search' },
            { "time": 11000, "type": 'select', "selector": '#search-criteria', "value": 'riskLevel' },
            { "time": 12000, "type": 'select', "selector": '#search-risk-level', "value": 'CRITICAL' },
            { "time": 13000, "type": 'click', "selector": 'button[onclick="executeSearch()"]' },
            { "time": 14000, "type": 'scroll', "value": 800 },
            { "time": 16000, "type": 'click', "selector": 'tbody tr:first-child a[onclick*="showIncident"]' },
            { "time": 19000, "type": 'scrollModal', "selector": '#incident-modal', "value": 400 },
            { "time": 23000, "type": 'click', "selector": '#incident-modal button[onclick="closeIncidentModal()"]' }
        ]
    },
    {
        "url": 'dcsa_security_training',
        "text": "Our fourth objective: Security Training. We provide specialized certifications to maintain a highly skilled workforce. Using the dropdown, you can search our course directory by Title, Code, Status, or Assigned Resource. Let's filter for courses that require action. Administrators can select individual training records to view completion timelines, non-compliant personnel lists, and assignment details.",
        "actions": [
            { "time": 3000, "type": 'scroll', "value": 400 },
            { "time": 8000, "type": 'custom', "fn": 'highlight_search' },
            { "time": 14000, "type": 'select', "selector": '#search-criteria', "value": 'status' },
            { "time": 15000, "type": 'select', "selector": '#search-status', "value": 'Action Needed' },
            { "time": 16000, "type": 'click', "selector": 'button[onclick="executeSearch()"]' },
            { "time": 17000, "type": 'scroll', "value": 800 },
            { "time": 19000, "type": 'click', "selector": 'tbody tr:first-child a[onclick*="showCourse"]' },
            { "time": 22000, "type": 'scrollModal', "selector": '#course-modal', "value": 400 },
            { "time": 25000, "type": 'click', "selector": '#course-modal button[onclick="closeCourseModal()"]' }
        ]
    },
    {
        "url": 'dcsa_full_integration',
        "text": "Now we move to our long-term strategic priorities for 2030. First: Achieve Full Integration. We are actively transitioning from siloed departments into a fully integrated agency, ensuring data flows seamlessly.",
        "actions": [{ "time": 4000, "type": 'scroll', "value": 'bottom' }]
    },
    {
        "url": 'dcsa_2040_threats',
        "text": "Our second priority: Prepare for 2040 Threat Landscapes. We are institutionalizing innovation and data integration to proactively anticipate emerging technology risks.",
        "actions": [{ "time": 4000, "type": 'scroll', "value": 'bottom' }]
    },
    {
        "url": 'dcsa_agency_profile',
        "text": "Our third priority: Elevate the Agency's Profile. We are establishing the DCSA as the premier provider of integrated security services, building transparency and trust.",
        "actions": [{ "time": 4000, "type": 'scroll', "value": 'bottom' }]
    },
    {
        "url": 'dcsa_resource_locator',
        "text": "Finally, the Resource Locator. This operational tool allows you to instantly search for DCSA personnel globally by first and last name. We will now locate an employee, view their profile on the map, and explore their duty status, schedule, and clearance. We can also seamlessly switch from 2D to a full 3D interactive globe perspective to visualize terrain and tactical data. After reviewing the asset, we conclude the automated tour.",
        "actions": [
            { "time": 3000, "type": 'custom', "fn": 'highlight_locate' },
            { "time": 6000, "type": 'type', "selector": '#locateSearchFirst', "value": 'Jane' },
            { "time": 7000, "type": 'type', "selector": '#locateSearchLast', "value": 'Doe' },
            { "time": 8000, "type": 'click', "selector": '#executeLocateSearchBtn' },
            { "time": 11000, "type": 'click', "selector": '.result-item' },
            { "time": 16000, "type": 'custom', "fn": 'show_countdown' },
            { "time": 19000, "type": 'click', "selector": '#toggleViewBtn' },
            { "time": 27000, "type": 'click', "selector": '.result-item' },
            { "time": 35000, "type": 'click', "selector": '#closePopup' }
        ]
    }
]

async def seed():
    async with aiosqlite.connect('sherpa_cms.db') as db:
        for step in demoSteps:
            # We use REPLACE so that we force-update the new demo flow content!
            await db.execute('''
                INSERT OR REPLACE INTO demo_configurations (id, page_url, text_content, actions_json)
                VALUES (
                    (SELECT id FROM demo_configurations WHERE page_url = ?),
                    ?, ?, ?
                )
            ''', (step['url'], step['url'], step['text'], json.dumps(step['actions'])))
        await db.commit()

asyncio.run(seed())
print("Seeding complete with REPLACE logic.")
