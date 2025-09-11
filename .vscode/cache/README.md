# Financial Analytics Refactoring Assessment

## Overview

This is a **code refactoring assessment** for candidates to demonstrate their ability to clean up and restructure an AI-generated financial analytics codebase. The system is designed for detecting suspicious financial activities, analyzing transaction patterns, and visualizing financial networks.

## Current State

The codebase is functional but suffers from typical AI-generated code issues:
- **Monolithic structure**: Most UI logic is crammed into `standardize_ui.py` (~8,300 lines)
- **Mixed concerns**: Business logic, UI components, and utilities are intermingled
- **Inconsistent patterns**: Different coding styles and approaches throughout
- **Limited separation**: No clear architectural boundaries between layers

## Your Mission

**Refactor this codebase into a clean, modular structure** while maintaining all existing functionality.

### Core Requirements

1. **Preserve Functionality**: All existing features must continue to work exactly as before
2. **Create Clear Architecture**: Implement a proper UI/Services/Utils separation
3. **Modular Design**: Break down the monolithic structure into focused, reusable components
4. **Code Quality**: Apply consistent coding standards and best practices

### Suggested Target Structure

```
src/
├── ui/                     # User Interface Layer
│   ├── __init__.py
│   ├── main_app.py        # Main Streamlit app entry point
│   ├── components/        # Reusable UI components
│   │   ├── __init__.py
│   │   ├── file_upload.py
│   │   ├── data_preview.py
│   │   ├── column_mapping.py
│   │   └── visualizations.py
│   └── pages/             # Different app pages/sections
│       ├── __init__.py
│       ├── data_upload.py
│       ├── analysis.py
│       └── reports.py
├── services/              # Business Logic Layer
│   ├── __init__.py
│   ├── data_processor.py  # CSV processing and validation
│   ├── entity_manager.py  # Entity resolution and management
│   ├── analytics_engine.py # Core analytics orchestration
│   └── export_service.py  # Data export functionality
├── utils/                 # Utility Functions
│   ├── __init__.py
│   ├── validators.py      # Data validation utilities
│   ├── formatters.py      # Data formatting helpers
│   ├── date_parser.py     # Smart date parsing logic
│   └── session_manager.py # Session state management
└── models/                # Data Models (if needed)
    ├── __init__.py
    └── data_models.py
```

## Current Components

The system includes these main functional areas:

### Core Analytics Modules
- **Graph Network Builder** (`graph_network_builder.py`) - Creates transaction networks
- **Mule Account Detector** (`mule_account_detector.py`) - Detects suspicious account patterns  
- **Network Cycle Detector** (`network_cycle_detector.py`) - Finds circular transaction patterns
- **Network Visualizer** (`network_visualizer.py`) - Creates interactive network visualizations
- **Time-Based Analytics** (`time_based_analytics.py`) - Temporal pattern analysis
- **Counterparty Trend Analyzer** (`counterparty_trend_analyzer.py`) - Analyzes counterparty relationships

### Supporting Modules
- **Digital PDF Extraction** (`digital_pdf_extraction.py`) - PDF processing capabilities
- **Trend Report Generator** (`trend_report_generator.py`) - Generates analysis reports
- **Graph Analysis Config** (`graph_analysis_config.py`) - Configuration management
- **Graph Data Models** (`graph_data_models.py`) - Data structure definitions

### The Monolith
- **Standardize UI** (`standardize_ui.py`) - Contains most of the application logic including:
  - File upload and validation
  - CSV format detection and conversion
  - Column mapping interface
  - Entity management
  - Session state handling
  - Data processing workflows
  - UI components and layouts

## Key Functionality to Preserve

### Data Processing
- Support for two CSV formats: separate debit/credit columns and unified amount with DR/CR indicator
- Smart date parsing with multiple format detection
- Automatic format conversion between CSV types
- Column mapping interface for flexible CSV structures

### Entity Management
- Entity resolution and deduplication
- Account association with entities
- Global entity registry maintenance
- Counterparty extraction and standardization

### Analytics Features
- Mule account pattern detection
- Network cycle analysis
- Time-based trend analysis
- Transaction flow visualization
- Counterparty relationship mapping

### User Interface
- File upload with drag-and-drop
- Real-time data validation and error reporting
- Interactive column mapping
- Data preview and summary statistics
- Export capabilities

## Assessment Criteria

You will be evaluated on:

### Architecture & Design (40%)
- Clear separation of concerns (UI/Services/Utils)
- Logical module organization
- Proper abstraction levels
- Maintainable code structure

### Code Quality (30%)
- Consistent coding standards
- Proper error handling
- Clear function/class responsibilities
- Documentation and comments

### Functionality Preservation (20%)
- All existing features work correctly
- No regression in user experience
- Data processing accuracy maintained
- Performance characteristics preserved

### Best Practices (10%)
- Proper imports and dependencies
- Configuration management
- Testing considerations
- Security best practices

## Getting Started

1. **Explore the codebase**: Start by understanding the current structure and functionality
2. **Run the application**: Use `streamlit run src/standardize_ui.py` to see it in action
3. **Plan your approach**: Design your target architecture before coding
4. **Refactor incrementally**: Break down the work into manageable chunks
5. **Test frequently**: Ensure functionality is preserved at each step

## Technical Stack

- **Python 3.11+**
- **Streamlit** - Web UI framework
- **Pandas** - Data manipulation
- **NetworkX** - Graph analysis
- **Plotly** - Interactive visualizations
- **Neo4j** - Graph database (optional)
- **FastAPI** - API framework (optional)

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
streamlit run src/standardize_ui.py
```

## Bonus Points

While not required, you can earn extra credit for:

- **Adding type hints** throughout the codebase
- **Implementing proper logging** instead of print statements
- **Creating configuration files** for better parameter management
- **Adding unit tests** for critical functions
- **Improving error messages** and user feedback
- **Optimizing performance** bottlenecks
- **Adding docstrings** following Python conventions
- **Implementing design patterns** where appropriate

## Submission Guidelines

1. **Preserve git history** - Make meaningful commits showing your refactoring process
2. **Update this README** - Document your architectural decisions and changes
3. **Include a migration guide** - Explain how to transition from old to new structure
4. **Test thoroughly** - Ensure all functionality works as expected
5. **Document any assumptions** - Note any decisions you made during refactoring

## Questions?

This is an open-book assessment. You're encouraged to:
- Research best practices for Python application architecture
- Look up Streamlit patterns and conventions
- Use any tools or resources that help you deliver quality code
- Make reasonable assumptions about requirements

The goal is to demonstrate your ability to take messy, functional code and transform it into a clean, maintainable, professional codebase.

Good luck! 🚀