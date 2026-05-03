import asyncio
import database

async def run():
    actions = [
        { "time": 0, "type": "scroll", "value": "0", "selector": "" },
        { "time": 4000, "type": "scroll", "value": "200", "selector": "" },
        { "time": 10000, "type": "scroll", "value": "450", "selector": "" },
        { "time": 12000, "type": "select", "value": "agent", "selector": "#search-criteria" },
        { "time": 15000, "type": "select", "value": "SSA Martinez", "selector": "#search-agent" },
        { "time": 17500, "type": "click", "value": "", "selector": "button[onclick='executeSearch()']" },
        { "time": 21000, "type": "click", "value": "", "selector": "a[onclick=\"showSubject('US-993-8472'); return false;\"]" },
        { "time": 26000, "type": "scrollModal", "value": "400", "selector": "#subject-modal" },
        { "time": 30000, "type": "click", "value": "", "selector": "a[onclick=\"openArtifact('Background Investigation', true); return false;\"]" },
        { "time": 33000, "type": "type", "value": "AUTHORIZED", "selector": "#classified-password" },
        { "time": 35000, "type": "click", "value": "", "selector": "button[onclick='submitPassword()']" },
        { "time": 39000, "type": "click", "value": "", "selector": "button[onclick='closeArtifactModal()']" },
        { "time": 41000, "type": "click", "value": "", "selector": "button[onclick='closeSubjectModal()']" }
    ]

    text = "Our first objective: Personnel Vetting. This team is responsible for background investigations and continuous vetting for the federal government. Note the active investigations and backlog tracking at the top. Let's look up a specific agent's caseload using the advanced case search. We'll filter by Assigned Agent and select SSA Martinez. Then, we can click into a specific case, like Michael Torres. This brings up the subject's full dossier, showing clearance level, current status, and a full timeline of investigation activities. We can even view official records directly from the timeline, such as the Background Investigation, which requires authorization and is then securely retrieved."

    await database.init_db()
    await database.save_demo_config(
        page_url="dcsa_personnel_vetting",
        text_content=text,
        actions_json=actions,
        voice_uri="",
        voice_rate=1.0,
        voice_volume=1.0
    )
    print("Done")

if __name__ == "__main__":
    asyncio.run(run())
