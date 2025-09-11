# Column Mapping Interface Troubleshooting

## Expected Behavior

When you upload a CSV or PDF file that doesn't match the expected format, the system should:

1. **Show validation errors** with details about what's wrong
2. **Display a success message** indicating column mapping is available
3. **Automatically redirect** to the column mapping interface
4. **Show a prominent header** "🔧 Column Mapping Required"
5. **Hide the sidebar** upload interface while in mapping mode

## If Column Mapping Interface Doesn't Appear

### Step 1: Check for the Manual Button
If the automatic redirect doesn't work, look for the **"🔧 Open Column Mapping Interface"** button after the validation errors and click it.

### Step 2: Enable Debug Mode
1. In the sidebar, check the **"🐛 Show Debug Info"** checkbox
2. Look for the debug information showing:
   - `show_column_mapping: True/False`
   - `df_for_mapping: Set/Not set`
   - `mapping_entity_name: Set/Not set`

### Step 3: Verify Your File Format
Make sure your file has:
- **At least 4 columns** with data
- **Header row** with column names
- **Transaction data** in the rows below headers

### Step 4: Common Issues and Solutions

#### Issue: "Could not automatically detect CSV format"
**Solution:** This is expected for files that need column mapping. The interface should appear automatically.

#### Issue: Page keeps refreshing but no column mapping
**Possible causes:**
1. Browser blocking the page refresh
2. Session state not persisting
3. File too large or corrupted

**Solutions:**
1. Try refreshing the page manually
2. Try a smaller sample of your data
3. Use the manual "Open Column Mapping Interface" button

#### Issue: Sidebar still showing during column mapping
**Expected:** The sidebar should be hidden when column mapping is active. If it's still showing, there might be a logic issue.

### Step 5: File Format Examples

#### ✅ Good CSV Structure (Separate Columns):
```csv
Date,Description,Debit,Credit
15/01/23,NEFT PAYMENT,5000,
16/01/23,SALARY CREDIT,,25000
```

#### ✅ Good CSV Structure (Unified Amount):
```csv
Date,Description,Amount,DR_CR
15/01/23,NEFT PAYMENT,5000,DR
16/01/23,SALARY CREDIT,25000,CR
```

#### ❌ Problematic Structure:
```csv
Transaction Date,Details,Money Out,Money In
15/01/23,NEFT PAYMENT,5000,
16/01/23,SALARY CREDIT,,25000
```
*This should trigger column mapping interface*

## What to Expect in Column Mapping Interface

1. **Format Selection:** Radio buttons to choose between "Separate Debit/Credit Columns" or "Unified Amount with DR/CR Indicator"
2. **Column Preview:** Your data preview showing first few rows
3. **Column Mapping:** Dropdown menus to map your columns to required fields
4. **Apply Button:** "✅ Apply Column Mapping" button to proceed

## Still Having Issues?

If the column mapping interface still doesn't appear:

1. **Check browser console** for JavaScript errors
2. **Try a different browser** (Chrome, Firefox, Safari)
3. **Clear browser cache** and reload the page
4. **Try with a smaller sample file** (first 10-20 rows)
5. **Ensure your CSV is properly formatted** with consistent columns

## Debug Information

When debug mode is enabled, you should see:
- `show_column_mapping: True` (when mapping should be active)
- `df_for_mapping: Set` (when data is ready for mapping)
- `mapping_entity_name: Set` (when entity name is provided)

If any of these show "Not set" or "False" when they should be active, there's a session state issue.