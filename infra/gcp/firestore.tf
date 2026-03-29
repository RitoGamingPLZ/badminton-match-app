resource "google_firestore_database" "default" {
  project                 = var.project_id
  name                    = "(default)"
  location_id             = var.firestore_location
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_DISABLED"

  depends_on = [google_project_service.apis]
}

# TTL policy — Firestore automatically deletes documents whose
# `expiresAt` timestamp field is in the past (matches the 24 h TTL
# set by FirestoreRepository when creating/updating rooms)
resource "google_firestore_field" "rooms_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "rooms"
  field      = "expiresAt"

  ttl_config {}

  depends_on = [google_firestore_database.default]
}
