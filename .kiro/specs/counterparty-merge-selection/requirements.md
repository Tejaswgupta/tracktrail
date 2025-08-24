# Requirements Document

## Introduction

The current counterparty merge feature uses similarity algorithms to automatically group similar counterparty names for bulk merging. However, the similarity algorithm can produce false positives where names are suggested for merging that shouldn't actually be merged together. This enhancement will add granular selection capabilities, allowing users to review and selectively choose which specific names within each suggested group should be merged, providing better control and accuracy in the counterparty standardization process.

## Requirements

### Requirement 1

**User Story:** As a law enforcement analyst, I want to review individual name suggestions within each merge group, so that I can identify and exclude false positives from the similarity algorithm.

#### Acceptance Criteria

1. WHEN viewing a counterparty merge group THEN the system SHALL display each suggested name as a selectable item within the group
2. WHEN a merge group is expanded THEN the system SHALL show checkboxes next to each individual suggested name (alias)
3. WHEN I uncheck a suggested name THEN the system SHALL exclude that name from the merge operation for that group
4. WHEN all suggested names in a group are unchecked THEN the system SHALL disable the merge operation for that group

### Requirement 2

**User Story:** As a law enforcement analyst, I want to see detailed information about each suggested name match, so that I can make informed decisions about which names to merge.

#### Acceptance Criteria

1. WHEN viewing individual name suggestions THEN the system SHALL display the confidence score for each name match
2. WHEN viewing individual name suggestions THEN the system SHALL show the number of transactions associated with each name
3. WHEN hovering over a suggested name THEN the system SHALL display sample transactions that use that specific name
4. WHEN viewing name suggestions THEN the system SHALL highlight the representative name that other names will be merged into

### Requirement 3

**User Story:** As a law enforcement analyst, I want to easily select or deselect multiple names within a group, so that I can efficiently manage large merge groups.

#### Acceptance Criteria

1. WHEN viewing a merge group THEN the system SHALL provide a "Select All Aliases" option for that group
2. WHEN viewing a merge group THEN the system SHALL provide a "Clear All Aliases" option for that group
3. WHEN I select "Select All Aliases" THEN the system SHALL check all individual name checkboxes in that group
4. WHEN I select "Clear All Aliases" THEN the system SHALL uncheck all individual name checkboxes in that group
5. WHEN some but not all aliases are selected THEN the group checkbox SHALL show an indeterminate state

### Requirement 4

**User Story:** As a law enforcement analyst, I want to change the representative name for a merge group, so that I can ensure the most appropriate name is used as the target for merging.

#### Acceptance Criteria

1. WHEN viewing a merge group THEN the system SHALL allow me to select a different representative name from the available options
2. WHEN I change the representative name THEN the system SHALL update the merge preview to show the new target name
3. WHEN I change the representative name THEN the system SHALL recalculate the affected transaction count
4. WHEN I change the representative name THEN the previous representative SHALL become a selectable alias option

### Requirement 5

**User Story:** As a law enforcement analyst, I want to see a clear summary of my merge selections, so that I can review the impact before applying changes.

#### Acceptance Criteria

1. WHEN I have made individual name selections THEN the system SHALL display an updated count of total names to be merged
2. WHEN I have made individual name selections THEN the system SHALL display an updated count of transactions that will be affected
3. WHEN I have made individual name selections THEN the system SHALL show a preview of the merge operations that will be performed
4. WHEN no individual names are selected in any group THEN the system SHALL disable the "Apply Merges" button
5. WHEN I apply merges THEN the system SHALL only merge the specifically selected names, not entire groups

### Requirement 6

**User Story:** As a law enforcement analyst, I want to search and filter within merge groups, so that I can quickly find specific names I'm looking for.

#### Acceptance Criteria

1. WHEN viewing the merge interface THEN the system SHALL provide a search box that filters both group names and individual aliases
2. WHEN I enter a search term THEN the system SHALL highlight matching text in group names and individual aliases
3. WHEN I search for a specific name THEN the system SHALL expand relevant groups to show matching aliases
4. WHEN I clear the search THEN the system SHALL return to the default collapsed view of groups
