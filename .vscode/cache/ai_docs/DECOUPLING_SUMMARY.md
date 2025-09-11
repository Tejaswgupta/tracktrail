# Counterparty Extraction and Entity Merging Decoupling

## Overview
Successfully decoupled counterparty extraction and entity merging into separate, independent tabs in the Bank Statement Analysis Tool.

## Changes Made

### 1. Tab Structure Update
**Before:**
- "1️⃣ Merge Duplicates" (combined extraction + merging)
- "🔗 Entity Linking"
- "2️⃣ Basic Analytics"
- "📈 Time-Based Trends"
- "🕸️ Graph Network Analysis"
- "3️⃣ Manual Investigation"

**After:**
- "🎯 Counterparty Extraction" (extraction only)
- "🔀 Entity Merging" (merging only)
- "🔗 Entity Linking"
- "📊 Basic Analytics"
- "📈 Time-Based Trends"
- "🕸️ Graph Network Analysis"
- "🔍 Manual Investigation"

### 2. New Functions Created

#### `counterparty_extraction_tab()`
- **Purpose**: Pure counterparty extraction from transaction descriptions only
- **Features**:
  - Bank preset selection for optimized extraction patterns
  - Smart counterparty extraction using regex patterns
  - Extraction statistics and success rate feedback
  - Custom name input for missed transactions
  - Summary of extracted counterparties
  - NO fuzzy matching or clustering

#### `entity_merging_tab()`
- **Purpose**: Independent fuzzy matching and entity merging
- **Features**:
  - Requires extraction to be completed first
  - Shows extraction summary metrics
  - Similarity threshold control for fuzzy matching
  - Advanced filtering options for clustering
  - Full merging interface for similar names
  - Cross-group merging capabilities
  - Merge confirmation and application

### 3. Function Modifications

#### `extract_counterparties(bank_preset)`
- **New Function**: Pure extraction logic only
- Extracts counterparty names from transaction descriptions
- Stores extracted names and statistics
- No fuzzy matching or clustering

#### `find_similar_names(threshold)`
- **New Function**: Pure fuzzy matching logic only
- Uses pre-extracted names from extraction step
- Performs clustering based on similarity threshold
- Stores clusters and similarity results

#### `show_extraction_results()`
- Removed clustering/merging interface integration
- Shows only extraction statistics and results
- Added completion messaging and next steps guidance
- Enhanced extracted counterparties summary

#### Updated References
- Changed all "Merge Duplicates" references to "Counterparty Extraction"
- Updated error messages and help text across the application

### 4. Independence Features

#### Counterparty Extraction Tab
- **Pure Extraction**: Only extracts names from descriptions, no clustering
- **Bank-Specific Patterns**: Optimized extraction for different banks
- **Validation**: Shows extraction success rates and missing names
- **Custom Input**: Allows manual entry for missed counterparties
- **Clear Output**: Provides summary and directs to merging tab

#### Entity Merging Tab
- **Pure Clustering**: Only performs fuzzy matching on extracted names
- **Dependency Check**: Validates that extraction has been completed
- **User-Controlled**: Fuzzy matching only runs on button click
- **Configurable**: Similarity threshold and advanced filtering options
- **Full Interface**: Complete merging capabilities with cross-group support

## Benefits

### 1. **Improved User Experience**
- Clear separation of concerns
- Step-by-step workflow
- Better progress tracking
- Reduced cognitive load

### 2. **Enhanced Flexibility**
- Users can focus on extraction quality first
- Merging becomes optional for clean data
- Independent troubleshooting of each step
- Better error isolation

### 3. **Better Workflow**
- Logical progression: Extract → Merge → Analyze
- Clear checkpoints at each stage
- Ability to iterate on extraction without losing merging work
- Independent validation of each step

### 4. **Maintainability**
- Cleaner code separation
- Easier debugging
- Independent testing of features
- Reduced coupling between components

## Usage Flow

1. **Upload Data**: Load bank statements via sidebar
2. **Extract Counterparties**: Use "🎯 Counterparty Extraction" tab
   - Select appropriate bank preset
   - Click "Extract Counterparties" button
   - Review and fix missing names
   - Validate extraction quality
3. **Find Similar Names**: Use "🔀 Entity Merging" tab
   - Set similarity threshold
   - Click "Find Similar Names" button
   - Review clustering results
4. **Merge Entities** (Optional): In same "🔀 Entity Merging" tab
   - Review similar name groups
   - Apply merges as needed
   - Or skip if no merging required
5. **Analyze**: Proceed to other analysis tabs

## Technical Details

### Session State Management
- `clusters`: Similar name groups from extraction
- `name_counts`: Frequency of extracted names
- `extraction_stats`: Extraction performance metrics
- `df_for_merging`: Processed dataframe with counterparty data
- `merge_mappings`: Applied name merges

### Error Handling
- Graceful handling when extraction not completed
- Clear error messages with guidance
- Validation of required data at each step

### Backward Compatibility
- All existing functionality preserved
- Session state structure maintained
- API compatibility with other modules

## Bug Fixes

### Fixed Automatic Triggering Issue
**Problem**: The `find_similar_names` logic was appearing to trigger automatically instead of only on button click.

**Root Cause**: The `show_extraction_results()` function was being called unconditionally, which displayed interface elements even when extraction hadn't been performed, creating confusion.

**Solution**:
1. **Conditional Display**: Made `show_extraction_results()` conditional on extraction completion
2. **Clear User Guidance**: Added informative message when extraction hasn't been run
3. **Data Preview**: Show transaction preview before extraction to help users understand the data
4. **Removed Unnecessary Calls**: Eliminated unnecessary `get_analysis_dataframe()` call in bank preset selection

**Result**: Now the extraction only runs when the user explicitly clicks the "🎯 Extract Counterparties" button.

### Fixed NameError Issue
**Problem**: `NameError: name 'groups_with_similar' is not defined` occurred in the extraction tab.

**Root Cause**: When separating extraction and clustering, a reference to `groups_with_similar` remained in the extraction results display, but this variable is only available after clustering is performed.

**Solution**: Removed the clustering-related logic from the extraction tab and replaced it with appropriate completion messaging that directs users to the entity merging tab.

**Result**: Clean separation with no cross-references between extraction and clustering logic.

## Future Enhancements

1. **Progress Indicators**: Visual progress bars across tabs
2. **Batch Processing**: Handle multiple files in extraction
3. **Export Options**: Save extraction/merging results
4. **Undo Functionality**: Reverse merging operations
5. **Advanced Matching**: ML-based entity resolution