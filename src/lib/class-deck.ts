
// In the students loop in loadClassDeck():

const students: EngineStudent[] = [];
let paletteIndex = 0;
for (const [sid, entries] of byStudent) {
  // ...existing loading code...

  students.push({
    id: sid,
    name: prof?.display_name || prof?.username || "Classmate",
    color: prof?.color || FALLBACK_PALETTE[paletteIndex % FALLBACK_PALETTE.length],
    bio: prof?.bio || "",
    entries: engineEntries,
    peerComments: [],
    isSelf: sid === user.id, // Set isSelf by comparing to current user id
  });
  paletteIndex++;
}
