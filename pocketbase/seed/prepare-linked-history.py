#!/usr/bin/env python3
"""Prepare only an offline copied PocketBase fixture for linked-history seeding."""
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

MARKER = ".kankaku-linked-history-fixture"
MARKER_TEXT = "kankaku-linked-history-fixture-v1\n"
MEMBERS = {
    "Mira Chen": ("mira-chen", "Engineering"),
    "Noah Rivera": ("noah-rivera", "Engineering"),
    "Leo Martin": ("leo-martin", "Operations"),
    "Sana Patel": ("sana-patel", "Operations"),
}
CLIENTS = {
    "linked-juniper": "Juniper Workshop", "linked-copper-finch": "Copper Finch Foods",
    "linked-tidal-grove": "Tidal Grove Library",
}
PROJECTS = {
    "linked-workshop-portal": ("Workshop Portal", "linked-juniper"),
    "linked-inventory-console": ("Inventory Console", "linked-juniper"),
    "linked-kitchen-planner": ("Kitchen Planner", "linked-copper-finch"),
    "linked-supplier-desk": ("Supplier Desk", "linked-copper-finch"),
    "linked-reading-room": ("Reading Room", "linked-tidal-grove"),
    "linked-archive-search": ("Archive Search", "linked-tidal-grove"),
}
TASKS = {
    "SEED-LINKED-001": ("Add workshop dashboard", "linked-workshop-portal"),
    "SEED-LINKED-002": ("Improve booking search", "linked-workshop-portal"),
    "SEED-LINKED-003": ("Add stock alerts", "linked-inventory-console"),
    "SEED-LINKED-004": ("Export inventory report", "linked-inventory-console"),
    "SEED-LINKED-005": ("Plan weekly menu", "linked-kitchen-planner"),
    "SEED-LINKED-006": ("Track ingredient orders", "linked-kitchen-planner"),
    "SEED-LINKED-007": ("Review supplier updates", "linked-supplier-desk"),
    "SEED-LINKED-008": ("Add invoice search", "linked-supplier-desk"),
    "SEED-LINKED-009": ("Build reading lists", "linked-reading-room"),
    "SEED-LINKED-010": ("Improve book discovery", "linked-reading-room"),
    "SEED-LINKED-011": ("Index archive records", "linked-archive-search"),
    "SEED-LINKED-012": ("Add archive filters", "linked-archive-search"),
}
MACHINES = {
    "linked-dev-01": ("Mira's Dev Machine", "Mira Chen"),
    "linked-dev-02": ("Noah's Dev Machine", "Noah Rivera"),
    "linked-ops-01": ("Leo's Ops Machine", "Leo Martin"),
    "linked-ops-02": ("Sana's Ops Machine", "Sana Patel"),
}


def fail(message):
    raise ValueError(message)


def checked_dir(arg):
    path = Path(arg)
    if path.is_symlink() or not path.is_dir():
        fail("fixture directory must be a real directory")
    if path.absolute().parent != Path("/tmp"):
        fail("fixture must be an immediate /tmp/kankaku-linked-history-* directory")
    resolved = path.resolve(strict=True)
    if resolved.parent != Path("/tmp").resolve() or not resolved.name.startswith("kankaku-linked-history-"):
        fail("fixture must be an immediate /tmp/kankaku-linked-history-* directory")
    if (resolved / "pocketbase" / "pb_data").exists() or resolved.name == "pb_data":
        fail("owner pb_data is never an offline fixture")
    marker = resolved / MARKER
    if marker.is_symlink() or not marker.is_file() or marker.read_text() != MARKER_TEXT:
        fail("missing or invalid offline fixture marker")
    db = resolved / "fixturedata.db"
    if db.is_symlink() or not db.is_file():
        fail("fixturedata.db must be a regular, non-symlink file")
    if os.stat(db, follow_symlinks=False).st_nlink != 1:
        fail("fixturedata.db hard link count must be 1")
    return db


def is_single_initial(history, expected):
    if len(history) != 1 or not isinstance(history[0], dict) or set(history[0]) != {"at", "value"} or history[0]["value"] != expected:
        return False
    try:
        instant = dt.datetime.fromisoformat(history[0]["at"].replace("Z", "+00:00"))
        return instant.tzinfo is not None
    except (AttributeError, TypeError, ValueError):
        return False


def assert_unopened(db):
    lsof = shutil.which("lsof")
    if not lsof:
        fail("lsof is required; refusing to inspect a possibly open database")
    result = subprocess.run([lsof, "-t", str(db)], capture_output=True, text=True)
    if result.returncode not in (0, 1):
        fail("lsof failed; refusing database access")
    if result.stdout.strip():
        fail("fixture database has an open reader or writer")


def main():
    if len(sys.argv) != 2:
        fail("usage: python3 pocketbase/seed/prepare-linked-history.py /tmp/kankaku-linked-history-COPY")
    db = checked_dir(sys.argv[1])
    assert_unopened(db)
    today = dt.datetime.now(dt.timezone.utc).date()
    anchor = dt.datetime.combine(today - dt.timedelta(days=10), dt.time(), dt.timezone.utc)
    at = anchor.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    connection = sqlite3.connect(db, timeout=1)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        client_rows = [row for row in connection.execute("SELECT id,code,name FROM clients").fetchall() if row["code"].startswith("linked-")]
        clients = {row["code"]: row for row in client_rows}
        if len(client_rows) != len(CLIENTS) or any(clients.get(code) is None or clients[code]["name"] != name for code, name in CLIENTS.items()):
            fail("fictional client catalog contains missing, extra, or mismatched rows")
        project_rows = [row for row in connection.execute("SELECT id,code,name,client FROM projects").fetchall() if row["code"].startswith("linked-")]
        projects = {row["code"]: row for row in project_rows}
        if len(project_rows) != len(PROJECTS) or any(projects.get(code) is None or projects[code]["name"] != name or projects[code]["client"] != clients[client]["id"] for code, (name, client) in PROJECTS.items()):
            fail("fictional project catalog contains missing, extra, or mismatched rows")
        task_rows = [row for row in connection.execute("SELECT id,external_ref,title,project FROM tasks").fetchall() if row["external_ref"].startswith("SEED-LINKED-")]
        tasks = {row["external_ref"]: row for row in task_rows}
        if len(task_rows) != len(TASKS) or any(tasks.get(ref) is None or tasks[ref]["title"] != title or tasks[ref]["project"] != projects[project]["id"] for ref, (title, project) in TASKS.items()):
            fail("fictional task catalog contains missing, extra, or mismatched rows")
        department_rows = connection.execute("SELECT id,name FROM departments").fetchall()
        departments = {row["name"]: row["id"] for row in department_rows if row["name"] in {"Engineering", "Operations"}}
        if len(departments) != 2 or any(sum(row["name"] == name for row in department_rows) != 1 for name in departments):
            fail("fictional department catalog contains missing or extra rows")
        members = [row for row in connection.execute("SELECT id,name,department,department_history FROM team_members").fetchall() if row["name"] in MEMBERS]
        machines = [row for row in connection.execute("SELECT id,key,name,member,assignment_history FROM machines").fetchall() if row["key"].startswith("linked-")]
        if len(members) != len(MEMBERS) or {row["name"] for row in members} != set(MEMBERS) or len(machines) != len(MACHINES) or {row["key"] for row in machines} != set(MACHINES):
            fail("fictional member/machine catalogs contain missing or extra rows")
        member_ids = {}
        member_updates = []
        machine_updates = []
        for row in members:
            if row["name"] not in MEMBERS:
                fail(f"unexpected linked member {row['name']}")
            key, department = MEMBERS[row["name"]]
            if row["department"] != departments.get(department):
                fail(f"member relationship mismatch: {row['name']}")
            history = json.loads(row["department_history"] or "[]")
            if not is_single_initial(history, row["department"]):
                fail(f"member history is not one matching initial event: {row['name']}")
            member_ids[row["name"]] = row["id"]
            if history[0].get("at") != at:
                member_updates.append((json.dumps([{ "at": at, "value": row["department"] }], separators=(",", ":")), row["id"]))
        for row in machines:
            if row["key"] not in MACHINES:
                fail(f"unexpected linked machine {row['key']}")
            name, member_name = MACHINES[row["key"]]
            if row["name"] != name or row["member"] != member_ids[member_name]:
                fail(f"machine identity/relationship mismatch: {row['key']}")
            history = json.loads(row["assignment_history"] or "[]")
            if not is_single_initial(history, row["member"]):
                fail(f"machine history is not one matching initial event: {row['key']}")
            if history[0].get("at") != at:
                machine_updates.append((json.dumps([{ "at": at, "value": row["member"] }], separators=(",", ":")), row["id"]))
        if len(member_updates) > 4 or len(machine_updates) > 4:
            fail("unexpected history update count")
        # All catalog, relationship and history checks finish before either update.
        connection.executemany("UPDATE team_members SET department_history=? WHERE id=?", member_updates)
        connection.executemany("UPDATE machines SET assignment_history=? WHERE id=?", machine_updates)
        connection.commit()
        print(f"Prepared linked fictional histories at {at} ({len(member_updates) + len(machine_updates)} fields updated).")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Refusing linked-history preparation: {error}", file=sys.stderr)
        sys.exit(1)
