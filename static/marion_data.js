/**
 * Marion VA Medical Center Map Data
 * This file serves as the foundational database for the 3D map engine and pathfinding algorithm.
 * 
 * Nodes represent physical locations (rooms, hallway intersections, elevators).
 * Edges represent the walkable paths between nodes, with a calculated distance/cost.
 */

// Simple 3D coordinate system: { x: Left/Right, y: Up/Down (Floor height), z: Forward/Backward }
const FLOOR_HEIGHT = 40; // Height between floors in 3D units

// Mock Data representing a simplified segment of Building 170 (Main Entrance & Ground Floor)
const MAP_DATA = {
    nodes: {
        // Floor 1 (Ground)

        "hall-corridor-1": { id: "hall-corridor-1", label: "Central Corridor A", x: 0, y: 0, z: 0, floor: 1, type: "hallway", building: "Bldg 170" },
        "hall-corridor-east-1": { id: "hall-corridor-east-1", label: "East Corridor", x: 100, y: 0, z: 0, floor: 1, type: "hallway", building: "Bldg 170" },
        "hall-corridor-west-1": { id: "hall-corridor-west-1", label: "West Corridor", x: -100, y: 0, z: 0, floor: 1, type: "hallway", building: "Bldg 170" },
        "elevator-bank-a": { id: "elevator-bank-a", label: "Elevator Bank A", x: 50, y: 0, z: -20, floor: 1, type: "elevator", building: "Bldg 170" },
        "stairs-main": { id: "stairs-main", label: "Main Stairwell", x: -50, y: 0, z: -20, floor: 1, type: "stairs", building: "Bldg 170" },

        // ─── Manually Mapped Ground Floor Departments ───











        
        // Generated VA Departments
        
        // Floor 2
        "elevator-bank-a-f2": { id: "elevator-bank-a-f2", label: "Elevator Bank A (F2)", x: 50, y: FLOOR_HEIGHT, z: -20, floor: 2, type: "elevator", building: "Bldg 170" },
        "stairs-main-f2": { id: "stairs-main-f2", label: "Main Stairwell (F2)", x: -50, y: FLOOR_HEIGHT, z: -20, floor: 2, type: "stairs", building: "Bldg 170" },
        "hall-corridor-2": { id: "hall-corridor-2", label: "Central Corridor F2", x: 0, y: FLOOR_HEIGHT, z: 0, floor: 2, type: "hallway", building: "Bldg 170" },

        
        // Floor 3
        "elevator-bank-a-f3": { id: "elevator-bank-a-f3", label: "Elevator Bank A (F3)", x: 50, y: FLOOR_HEIGHT * 2, z: -20, floor: 3, type: "elevator", building: "Bldg 170" },
        "hall-corridor-3": { id: "hall-corridor-3", label: "Central Corridor F3", x: 0, y: FLOOR_HEIGHT * 2, z: 0, floor: 3, type: "hallway", building: "Bldg 170" },
        
        // Floor 4
        "elevator-bank-a-f4": { id: "elevator-bank-a-f4", label: "Elevator Bank A (F4)", x: 50, y: FLOOR_HEIGHT * 3, z: -20, floor: 4, type: "elevator", building: "Bldg 170" },
        "hall-corridor-4": { id: "hall-corridor-4", label: "Central Corridor F4", x: 0, y: FLOOR_HEIGHT * 3, z: 0, floor: 4, type: "hallway", building: "Bldg 170" },

        // ─── Bldg 2 – Canteen / Retail Store ───
        "ent-bldg2": { id: "ent-bldg2", label: "Bldg 2 Entrance", x: -200, y: 0, z: 300, floor: -1, type: "entrance", building: "Bldg 2" },
        "hall-bldg2": { id: "hall-bldg2", label: "Bldg 2 Lobby", x: -200, y: 0, z: 260, floor: -1, type: "hallway", building: "Bldg 2" },

        // ─── Bldg 8 – Administration ───
        "ent-bldg8": { id: "ent-bldg8", label: "Bldg 8 Entrance (Administration)", x: 480, y: 0, z: 100, floor: -1, type: "entrance", building: "Bldg 8" },
        "hall-bldg8": { id: "hall-bldg8", label: "Bldg 8 Lobby", x: 480, y: 0, z: 60, floor: -1, type: "hallway", building: "Bldg 8" },
        "dept-admin-8": { id: "dept-admin-8", label: "Administration (Bldg 8)", x: 500, y: 0, z: 40, floor: -1, type: "department", building: "Bldg 8" },

        // ─── Bldg 13 – Administration ───
        "ent-bldg13": { id: "ent-bldg13", label: "Bldg 13 Entrance (Administration)", x: 350, y: 0, z: 400, floor: -1, type: "entrance", building: "Bldg 13" },
        "hall-bldg13": { id: "hall-bldg13", label: "Bldg 13 Lobby", x: 350, y: 0, z: 360, floor: -1, type: "hallway", building: "Bldg 13" },
        "dept-admin-13": { id: "dept-admin-13", label: "Administration (Bldg 13)", x: 370, y: 0, z: 340, floor: -1, type: "department", building: "Bldg 13" },

        // ─── Bldg 14 – Boiler Plant ───
        "ent-bldg14": { id: "ent-bldg14", label: "Bldg 14 Entrance (Boiler Plant)", x: 650, y: 0, z: 300, floor: -1, type: "entrance", building: "Bldg 14" },

        // ─── Bldg 15 – Engineering ───
        "ent-bldg15": { id: "ent-bldg15", label: "Bldg 15 Entrance (Engineering)", x: 680, y: 0, z: 420, floor: -1, type: "entrance", building: "Bldg 15" },

        // ─── Bldg 16 – Logistics ───
        "ent-bldg16": { id: "ent-bldg16", label: "Bldg 16 Entrance (Logistics)", x: 600, y: 0, z: 420, floor: -1, type: "entrance", building: "Bldg 16" },

        // ─── Bldg 37 – IT and BioMedical ───
        "ent-bldg37": { id: "ent-bldg37", label: "Bldg 37 Entrance (IT & BioMedical)", x: -320, y: 0, z: 200, floor: -1, type: "entrance", building: "Bldg 37" },
        "hall-bldg37": { id: "hall-bldg37", label: "Bldg 37 Lobby", x: -320, y: 0, z: 160, floor: -1, type: "hallway", building: "Bldg 37" },


        // ─── Bldg 43 – Community Living Center (CLC) ───
        "ent-bldg43": { id: "ent-bldg43", label: "Bldg 43 Entrance (CLC)", x: 500, y: 0, z: -100, floor: -1, type: "entrance", building: "Bldg 43" },
        "hall-bldg43-1": { id: "hall-bldg43-1", label: "CLC Main Corridor", x: 500, y: 0, z: -130, floor: -1, type: "hallway", building: "Bldg 43" },
        "dept-clc-nursing": { id: "dept-clc-nursing", label: "CLC Nursing Station", x: 480, y: 0, z: -150, floor: -1, type: "department", building: "Bldg 43" },
        "dept-clc-therapy": { id: "dept-clc-therapy", label: "CLC Physical Therapy", x: 500, y: 0, z: -180, floor: -1, type: "department", building: "Bldg 43" },
        "dept-clc-dining": { id: "dept-clc-dining", label: "CLC Dining Room", x: 540, y: 0, z: -130, floor: -1, type: "department", building: "Bldg 43" },

        // ─── Bldg 49 ───
        "ent-bldg49": { id: "ent-bldg49", label: "Bldg 49 Entrance", x: -100, y: 0, z: 480, floor: -1, type: "entrance", building: "Bldg 49" },
        "hall-bldg49": { id: "hall-bldg49", label: "Bldg 49 Lobby", x: -100, y: 0, z: 450, floor: -1, type: "hallway", building: "Bldg 49" },

        // ─── Bldg 81 – RRTP (Residential Rehabilitation Treatment Program) ───
        "ent-bldg81": { id: "ent-bldg81", label: "Bldg 81 Entrance (RRTP)", x: 300, y: 0, z: -380, floor: -1, type: "entrance", building: "Bldg 81" },
        "hall-bldg81": { id: "hall-bldg81", label: "RRTP Main Corridor", x: 300, y: 0, z: -420, floor: -1, type: "hallway", building: "Bldg 81" },
        "dept-rrtp-mhclinic": { id: "dept-rrtp-mhclinic", label: "RRTP Mental Health Clinic", x: 280, y: 0, z: -440, floor: -1, type: "department", building: "Bldg 81" },

        // ─── Bldg 82 – AMVETS / American Legion / DAV ───
        "ent-bldg82": { id: "ent-bldg82", label: "Bldg 82 Entrance (Veteran Service Orgs)", x: 480, y: 0, z: -320, floor: -1, type: "entrance", building: "Bldg 82" },
        "hall-bldg82": { id: "hall-bldg82", label: "Bldg 82 Lobby", x: 480, y: 0, z: -360, floor: -1, type: "hallway", building: "Bldg 82" },



        // ─── Bldg 83 – Behavioral Health Building ───
        "ent-bldg83": { id: "ent-bldg83", label: "Bldg 83 Entrance (Behavioral Health)", x: 360, y: 0, z: -320, floor: -1, type: "entrance", building: "Bldg 83" },
        "hall-bldg83": { id: "hall-bldg83", label: "Behavioral Health Corridor", x: 360, y: 0, z: -360, floor: -1, type: "hallway", building: "Bldg 83" },
        "dept-mental-health": { id: "dept-mental-health", label: "Mental Health Clinic", x: 340, y: 0, z: -380, floor: -1, type: "department", building: "Bldg 83" },
        "dept-substance-abuse": { id: "dept-substance-abuse", label: "Substance Abuse Treatment", x: 370, y: 0, z: -390, floor: -1, type: "department", building: "Bldg 83" },


        // ─── M1 – Administration ───
        "ent-m1": { id: "ent-m1", label: "M1 Entrance (Administration)", x: -500, y: 0, z: 400, floor: -1, type: "entrance", building: "M1" },
        "hall-m1": { id: "hall-m1", label: "M1 Main Hall", x: -500, y: 0, z: 360, floor: -1, type: "hallway", building: "M1" },
        "dept-m1-admin": { id: "dept-m1-admin", label: "Administration (M1)", x: -520, y: 0, z: 340, floor: -1, type: "department", building: "M1" },

        // ─── M2 through M6 – Administration Buildings ───
        "ent-m2": { id: "ent-m2", label: "M2 Entrance (Administration)", x: -420, y: 0, z: 300, floor: -1, type: "entrance", building: "M2" },
        "dept-m2": { id: "dept-m2", label: "Administration Building M2", x: -430, y: 0, z: 280, floor: -1, type: "department", building: "M2" },

        "ent-m3": { id: "ent-m3", label: "M3 Entrance (Administration)", x: -440, y: 0, z: 320, floor: -1, type: "entrance", building: "M3" },
        "dept-m3": { id: "dept-m3", label: "Administration Building M3", x: -450, y: 0, z: 300, floor: -1, type: "department", building: "M3" },

        "ent-m4": { id: "ent-m4", label: "M4 Entrance (Administration)", x: -440, y: 0, z: 420, floor: -1, type: "entrance", building: "M4" },
        "dept-m4": { id: "dept-m4", label: "Administration Building M4", x: -450, y: 0, z: 440, floor: -1, type: "department", building: "M4" },

        "ent-m5": { id: "ent-m5", label: "M5 Entrance (Administration)", x: -480, y: 0, z: 200, floor: -1, type: "entrance", building: "M5" },
        "dept-m5": { id: "dept-m5", label: "Administration Building M5", x: -490, y: 0, z: 180, floor: -1, type: "department", building: "M5" },

        "ent-m6": { id: "ent-m6", label: "M6 Entrance (Administration)", x: -460, y: 0, z: 300, floor: -1, type: "entrance", building: "M6" },
        "dept-m6": { id: "dept-m6", label: "Administration Building M6", x: -470, y: 0, z: 280, floor: -1, type: "department", building: "M6" },

        // ─── Campus Walkway Hub & Pathway Nodes ───
        // Central campus connection points used to route between buildings
        "campus-hub": { id: "campus-hub", label: "Campus Central Walkway", x: 0, y: 0, z: 200, floor: -1, type: "hallway", building: "Campus" },
        "campus-east": { id: "campus-east", label: "East Campus Path", x: 300, y: 0, z: 150, floor: -1, type: "hallway", building: "Campus" },
        "campus-west": { id: "campus-west", label: "West Campus Path", x: -300, y: 0, z: 150, floor: -1, type: "hallway", building: "Campus" },
        "campus-north": { id: "campus-north", label: "North Campus Path", x: 0, y: 0, z: -200, floor: -1, type: "hallway", building: "Campus" },
        "campus-south-east": { id: "campus-south-east", label: "Southeast Campus Path", x: 400, y: 0, z: -250, floor: -1, type: "hallway", building: "Campus" },

        // ─── Campus Parking Zones ───
        "parking-west": { id: "parking-west", label: "West Campus Parking", x: -400, y: 0, z: 200, floor: -1, type: "parking", building: "Campus Parking" },
        "parking-east": { id: "parking-east", label: "East Campus Parking", x: 500, y: 0, z: 300, floor: -1, type: "parking", building: "Campus Parking" },
        "parking-north": { id: "parking-north", label: "North Campus Parking (CLC)", x: 580, y: 0, z: -100, floor: -1, type: "parking", building: "Campus Parking" },
        "parking-main": { id: "parking-main", label: "Main Hospital Parking", x: 0, y: 0, z: 300, floor: -1, type: "parking", building: "Campus Parking" },


        "ent-170": { id: "ent-170", label: "Main Entrance", x: 58.8, y: 0, z: 48.5, floor: 1, type: "entrance", building: "Bldg 170" },
        "dept-cashier": { id: "dept-cashier", label: "Agent Cashier", x: 18.8, y: 0, z: 0.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-travel": { id: "dept-travel", label: "Travel Office", x: 17.2, y: 0, z: -11.5, floor: 1, type: "department", building: "Bldg 170" },
        "dept-police": { id: "dept-police", label: "Police", x: 59.2, y: 0, z: -7.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-pharmacy": { id: "dept-pharmacy", label: "Pharmacy", x: 94.8, y: 0, z: 1.5, floor: 1, type: "department", building: "Bldg 170" },
        "dept-advocate": { id: "dept-advocate", label: "Patient Advocate", x: 79.8, y: 0, z: -25.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-registration": { id: "dept-registration", label: "Registration/Admissions", x: 162.2, y: 0, z: -5.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-laboratory": { id: "dept-laboratory", label: "Laboratory Check-in", x: -27.8, y: 0, z: -120.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-imaging": { id: "dept-imaging", label: "Imaging", x: 17.2, y: 0, z: -130.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-canteen": { id: "dept-canteen", label: "Canteen", x: 169.8, y: 0, z: -139.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-patriot": { id: "dept-patriot", label: "Patriot Store", x: 125.2, y: 0, z: -117.5, floor: 1, type: "department", building: "Bldg 170" },
        "dept-eligibility": { id: "dept-eligibility", label: "Eligibility", x: 136.2, y: 0, z: -22.0, floor: 1, type: "department", building: "Bldg 170" },
        "dept-emergency": { id: "dept-emergency", label: "Emergency Room", x: -74.2, y: 0, z: 5.5, floor: 1, type: "department", building: "Bldg 170" },
        "hall-main-1": { id: "hall-main-1", label: "Main Hall Corridor", x: 58.8, y: 0, z: 15.0, floor: 1, type: "hallway", building: "Bldg 170" },
        "hall-corridor-1": { id: "hall-corridor-1", label: "T Intersection", x: 58.8, y: 0, z: 15.0, floor: 1, type: "hallway", building: "Bldg 170" },
        "hall-corridor-west-1": { id: "hall-corridor-west-1", label: "West Corridor", x: 18.8, y: 0, z: 15.0, floor: 1, type: "hallway", building: "Bldg 170" },
        "hall-corridor-east-1": { id: "hall-corridor-east-1", label: "East Corridor", x: 94.8, y: 0, z: 15.0, floor: 1, type: "hallway", building: "Bldg 170" },
    }, // end nodes

    // Connections between nodes
    edges: [
        // Ground Floor Hierarchy
        { from: "ent-170", to: "hall-main-1", type: "walkway" },
        { from: "hall-main-1", to: "hall-corridor-1", type: "walkway" },
        { from: "hall-corridor-1", to: "hall-corridor-east-1", type: "walkway" },
        { from: "hall-corridor-1", to: "hall-corridor-west-1", type: "walkway" },
        { from: "hall-corridor-1", to: "elevator-bank-a", type: "walkway" },
        { from: "hall-corridor-1", to: "stairs-main", type: "walkway" },


        // ─── Manual Ground Floor Connections ───
        
        // Hallway Spine
        { from: "ent-170", to: "hall-main-1", type: "walkway" },
        { from: "hall-main-1", to: "hall-corridor-1", type: "walkway" },
        { from: "hall-corridor-1", to: "hall-corridor-west-1", type: "walkway" },
        { from: "hall-corridor-1", to: "hall-corridor-east-1", type: "walkway" },
        
        // Connecting Departments to Spine
        { from: "hall-corridor-west-1", to: "dept-cashier", type: "walkway" },
        { from: "hall-corridor-west-1", to: "dept-travel", type: "walkway" },
        { from: "hall-corridor-1", to: "dept-police", type: "walkway" },
        { from: "hall-corridor-1", to: "dept-advocate", type: "walkway" },
        { from: "hall-corridor-east-1", to: "dept-pharmacy", type: "walkway" },
        
        // Further routing (approx paths)
        { from: "hall-corridor-east-1", to: "dept-registration", type: "walkway" },
        { from: "dept-registration", to: "dept-eligibility", type: "walkway" },
        
        { from: "hall-corridor-1", to: "dept-imaging", type: "walkway" },
        { from: "dept-imaging", to: "dept-laboratory", type: "walkway" },
        { from: "dept-imaging", to: "dept-patriot", type: "walkway" },
        { from: "dept-patriot", to: "dept-canteen", type: "walkway" },
        
        { from: "hall-corridor-west-1", to: "dept-emergency", type: "walkway" },
        
        // Generated Clinics Connections
        
        // Vertical Connections
        { from: "elevator-bank-a", to: "elevator-bank-a-f2", type: "elevator", accessible: true },
        { from: "elevator-bank-a-f2", to: "elevator-bank-a-f3", type: "elevator", accessible: true },
        { from: "elevator-bank-a-f3", to: "elevator-bank-a-f4", type: "elevator", accessible: true },
        { from: "stairs-main", to: "stairs-main-f2", type: "stairs", accessible: false }, // Not wheelchair accessible
        
        // F2 Connections
        { from: "elevator-bank-a-f2", to: "hall-corridor-2", type: "walkway" },
        { from: "stairs-main-f2", to: "hall-corridor-2", type: "walkway" },

        // F3 Connections
        { from: "elevator-bank-a-f3", to: "hall-corridor-3", type: "walkway" },
        // stairs-main-f3 not currently defined, skipping stairs for f3        
        // F4 Connections
        { from: "elevator-bank-a-f4", to: "hall-corridor-4", type: "walkway" },

        // ─── Campus Hub Network – connects all buildings ───
        // Bldg 170 (Main Hospital) exits to campus hub
        { from: "ent-170", to: "campus-hub", type: "walkway" },
        // Hub spokes to each compass pathway
        { from: "campus-hub", to: "campus-east", type: "walkway" },
        { from: "campus-hub", to: "campus-west", type: "walkway" },
        { from: "campus-hub", to: "campus-north", type: "walkway" },
        { from: "campus-east", to: "campus-south-east", type: "walkway" },
        // Campus north connects to CLC (Bldg 43) area
        { from: "campus-north", to: "ent-bldg43", type: "walkway" },
        { from: "campus-south-east", to: "ent-bldg81", type: "walkway" },
        { from: "campus-south-east", to: "ent-bldg82", type: "walkway" },
        { from: "campus-south-east", to: "ent-bldg83", type: "walkway" },
        // East campus connects to admin buildings
        { from: "campus-east", to: "ent-bldg8", type: "walkway" },
        { from: "campus-east", to: "ent-bldg13", type: "walkway" },
        { from: "campus-east", to: "ent-bldg14", type: "walkway" },
        { from: "campus-east", to: "ent-bldg15", type: "walkway" },
        { from: "campus-east", to: "ent-bldg16", type: "walkway" },
        { from: "campus-west", to: "ent-m3", type: "walkway" },
        { from: "campus-west", to: "ent-m4", type: "walkway" },
        // West campus connects to residential and IT
        { from: "campus-west", to: "ent-bldg2", type: "walkway" },
        { from: "campus-west", to: "ent-bldg37", type: "walkway" },
        { from: "campus-west", to: "ent-m1", type: "walkway" },
        { from: "campus-west", to: "ent-m2", type: "walkway" },
        { from: "campus-west", to: "ent-m5", type: "walkway" },
        { from: "campus-west", to: "ent-m6", type: "walkway" },
        // Hub also connects to Bldg 49
        { from: "campus-hub", to: "ent-bldg49", type: "walkway" },

        // ─── Bldg 2 – Canteen/Retail ───
        { from: "ent-bldg2", to: "hall-bldg2", type: "walkway" },
        { from: "hall-bldg2", to: "dept-canteen", type: "walkway" },

        // ─── Bldg 8 – Administration ───
        { from: "ent-bldg8", to: "hall-bldg8", type: "walkway" },
        { from: "hall-bldg8", to: "dept-admin-8", type: "walkway" },

        // ─── Bldg 13 – Administration ───
        { from: "ent-bldg13", to: "hall-bldg13", type: "walkway" },
        { from: "hall-bldg13", to: "dept-admin-13", type: "walkway" },

        // ─── Bldg 14 – Boiler Plant ───
        { from: "ent-bldg14", to: "dept-boiler", type: "walkway" },

        // ─── Bldg 15 – Engineering ───
        { from: "ent-bldg15", to: "dept-engineering", type: "walkway" },

        // ─── Bldg 16 – Logistics ───
        { from: "ent-bldg16", to: "dept-logistics", type: "walkway" },

        // ─── Bldg 37 – IT and BioMedical ───
        { from: "ent-bldg37", to: "hall-bldg37", type: "walkway" },
        { from: "hall-bldg37", to: "dept-it", type: "walkway" },
        { from: "hall-bldg37", to: "dept-biomedical", type: "walkway" },

        // ─── Bldg 43 – Community Living Center ───
        { from: "ent-bldg43", to: "hall-bldg43-1", type: "walkway" },
        { from: "hall-bldg43-1", to: "dept-clc", type: "walkway" },
        { from: "hall-bldg43-1", to: "dept-clc-nursing", type: "walkway" },
        { from: "hall-bldg43-1", to: "dept-clc-therapy", type: "walkway" },
        { from: "hall-bldg43-1", to: "dept-clc-dining", type: "walkway" },

        // ─── Bldg 49 ───
        { from: "ent-bldg49", to: "hall-bldg49", type: "walkway" },

        // ─── Bldg 81 – RRTP ───
        { from: "ent-bldg81", to: "hall-bldg81", type: "walkway" },
        { from: "hall-bldg81", to: "dept-rrtp", type: "walkway" },
        { from: "hall-bldg81", to: "dept-rrtp-mhclinic", type: "walkway" },

        // ─── Bldg 82 – Veteran Service Orgs ───
        { from: "ent-bldg82", to: "hall-bldg82", type: "walkway" },
        { from: "hall-bldg82", to: "dept-amvets", type: "walkway" },
        { from: "hall-bldg82", to: "dept-amlegion", type: "walkway" },
        { from: "hall-bldg82", to: "dept-dav", type: "walkway" },

        // ─── Bldg 83 – Behavioral Health ───
        { from: "ent-bldg83", to: "hall-bldg83", type: "walkway" },
        { from: "hall-bldg83", to: "dept-mental-health", type: "walkway" },
        { from: "hall-bldg83", to: "dept-substance-abuse", type: "walkway" },
        { from: "hall-bldg83", to: "dept-ptsd", type: "walkway" },
        { from: "hall-bldg83", to: "dept-psych", type: "walkway" },

        // ─── M Buildings – Residential ───
        { from: "ent-m1", to: "hall-m1", type: "walkway" },
        { from: "hall-m1", to: "dept-m1-residential", type: "walkway" },
        { from: "ent-m2", to: "dept-m2", type: "walkway" },
        { from: "ent-m3", to: "dept-m3", type: "walkway" },
        { from: "ent-m4", to: "dept-m4", type: "walkway" },
        { from: "ent-m5", to: "dept-m5", type: "walkway" },
        { from: "ent-m6", to: "dept-m6", type: "walkway" },

    ],
    
    // Geometry definitions for drawing the building shells
    buildings: [
        {
            id: "bldg-170",
            levels: [
                {
                    floor: 1,
                    walls: [ // Define corners of the floorplan (simplified)
                        {x: -150, z: 120}, {x: 150, z: 120}, {x: 150, z: -60}, {x: -150, z: -60}
                    ]
                },
                {
                    floor: 2,
                    walls: [
                        {x: -150, z: 120}, {x: 150, z: 120}, {x: 150, z: -60}, {x: -150, z: -60}
                    ]
                }
            ]
        }
    ]
};

// Compute Euclidean distances for all edges to use as weights in A* algorithm
MAP_DATA.edges.forEach(edge => {
    const start = MAP_DATA.nodes[edge.from];
    const end = MAP_DATA.nodes[edge.to];
    if(start && end) {
        // Distance formula: sqrt(dx^2 + dy^2 + dz^2)
        edge.distance = Math.sqrt(
            Math.pow(end.x - start.x, 2) + 
            Math.pow(end.y - start.y, 2) + 
            Math.pow(end.z - start.z, 2)
        );
        
        // Add artificial penalty for stairs if we want to encourage elevators normally
        if(edge.type === 'stairs') {
            edge.distance += 50; 
        }
    }
});
