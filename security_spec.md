# Security Specification: SSDI Asset Inventory

## Data Invariants
1. An asset must have an owner ID matching the creator.
2. A maintenance log must reference a valid asset document.
3. Assets cannot be updated to have a cost less than 0.
4. Maintenance logs can only be created by the asset owner or an admin.

## The Dirty Dozen Payloads (Rejection Tests)

1. **Identity Theft (Asset)**: Create an asset with `ownerId` set to a different user's UID.
2. **Identity Theft (Log)**: Create a maintenance log for an asset owned by someone else.
3. **Invalid Status (Asset)**: Update asset status to a value not in the enum (e.g., "Exploded").
4. **Invalid Cost (Asset)**: Set asset cost to -500.
5. **Missing Required Field (Asset)**: Create asset without a `name`.
6. **Shadow Update (Asset)**: Update an asset with an extra field `isAdmin: true`.
7. **Cross-User Leak (Asset)**: Query (list) all assets without filtering by `ownerId`.
8. **Resource Poisoning (Location)**: Create a location with a document ID that is 2KB of random characters.
9. **Tamper with Identity (Asset)**: Update an existing asset's `ownerId`.
10. **Tamper with History (Log)**: Update a maintenance log's `assetId`.
11. **Spoofed Timestamp (Asset)**: Set `createdAt` to a date in the past during creation instead of `request.time`.
12. **Unauthorized Deletion (Asset)**: Delete an asset belonging to another user.

## Rules Draft

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default Deny
    match /{document=**} {
      allow read, write: if false;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(data) {
      return isSignedIn() && data.ownerId == request.auth.uid;
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    // --- Assets ---
    match /assets/{assetId} {
      function isValidAsset(data) {
        return data.keys().hasAll(['name', 'category', 'status', 'condition', 'ownerId', 'createdAt', 'updatedAt'])
               && data.name is string && data.name.size() > 0 && data.name.size() <= 200
               && data.category in ['IT', 'Office', 'Furniture', 'Vehicle', 'Machinery', 'Other']
               && data.status in ['Available', 'In Use', 'Under Maintenance', 'Retired', 'Missing']
               && data.condition in ['Excellent', 'Good', 'Fair', 'Poor', 'Broken']
               && data.ownerId == request.auth.uid
               && (data.get('cost', 0) is number && data.get('cost', 0) >= 0)
               && (data.get('serialNumber', '') is string && data.get('serialNumber', '').size() <= 100);
      }

      allow get: if isOwner(existing());
      allow list: if isSignedIn() && existing().ownerId == request.auth.uid;
      
      allow create: if isSignedIn() && isValidId(assetId) && isValidAsset(incoming())
                       && incoming().createdAt == request.time
                       && incoming().updatedAt == request.time;
      
      allow update: if isOwner(existing()) && isValidAsset(incoming())
                       && incoming().updatedAt == request.time
                       && incoming().createdAt == existing().createdAt
                       && (
                         // Action: Move Location
                         incoming().diff(existing()).affectedKeys().hasOnly(['locationId', 'updatedAt']) ||
                         // Action: Change Status/Condition
                         incoming().diff(existing()).affectedKeys().hasOnly(['status', 'condition', 'updatedAt']) ||
                         // Action: Edit Details
                         incoming().diff(existing()).affectedKeys().hasOnly(['name', 'category', 'serialNumber', 'cost', 'updatedAt']) ||
                         // Action: Maintenance Update
                         incoming().diff(existing()).affectedKeys().hasOnly(['lastMaintenanceDate', 'nextMaintenanceDate', 'updatedAt'])
                       );
      
      allow delete: if isOwner(existing());
    }

    // --- Locations ---
    match /locations/{locationId} {
      function isValidLocation(data) {
        return data.keys().hasAll(['name'])
               && data.name is string && data.name.size() > 0 && data.name.size() <= 100
               && data.get('description', '') is string && data.get('description', '').size() <= 500;
      }

      allow read: if isSignedIn();
      allow create: if isSignedIn() && isValidId(locationId) && isValidLocation(incoming());
      allow update: if isSignedIn() && isValidLocation(incoming())
                       && incoming().diff(existing()).affectedKeys().hasOnly(['name', 'description']);
      allow delete: if isSignedIn(); // In a real app, maybe only admin
    }

    // --- Maintenance Logs ---
    match /maintenance_logs/{logId} {
      function isValidLog(data) {
        return data.keys().hasAll(['assetId', 'date', 'type', 'status'])
               && data.assetId is string && data.assetId.size() > 0
               && data.type in ['Routine', 'Repair', 'Upgrade', 'Inspection']
               && data.status in ['Completed', 'Scheduled']
               && (data.get('cost', 0) is number && data.get('cost', 0) >= 0);
      }

      // Check if user owns the asset the log belongs to
      function ownsLinkedAsset(assetId) {
        return get(/databases/$(database)/documents/assets/$(assetId)).data.ownerId == request.auth.uid;
      }

      allow get: if isSignedIn() && ownsLinkedAsset(existing().assetId);
      allow list: if isSignedIn() && ownsLinkedAsset(resource.data.assetId);

      allow create: if isSignedIn() && isValidId(logId) && isValidLog(incoming())
                       && ownsLinkedAsset(incoming().assetId);
      
      allow update: if isSignedIn() && ownsLinkedAsset(existing().assetId)
                       && isValidLog(incoming())
                       && incoming().assetId == existing().assetId
                       && incoming().diff(existing()).affectedKeys().hasOnly(['date', 'type', 'status', 'description', 'cost', 'performedBy']);
      
      allow delete: if isSignedIn() && ownsLinkedAsset(existing().assetId);
    }
  }
}
```
