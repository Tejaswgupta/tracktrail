-- Bank Regex Patterns Table
-- Stores regex patterns for extracting counterparties from bank transaction descriptions

CREATE TABLE bank_regex_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_preset VARCHAR(50) NOT NULL,
  pattern TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  version INTEGER DEFAULT 1,
  notes TEXT
);

-- Create indexes for performance
CREATE INDEX idx_bank_regex_patterns_bank_preset ON bank_regex_patterns(bank_preset);
CREATE INDEX idx_bank_regex_patterns_active ON bank_regex_patterns(is_active);
CREATE INDEX idx_bank_regex_patterns_priority ON bank_regex_patterns(priority DESC);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bank_regex_patterns_updated_at
    BEFORE UPDATE ON bank_regex_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE bank_regex_patterns ENABLE ROW LEVEL SECURITY;

-- Policy to allow all users to read active patterns
CREATE POLICY "Allow read access to active patterns" ON bank_regex_patterns
    FOR SELECT USING (is_active = true);

-- Policy to allow all users to insert new patterns
CREATE POLICY "Allow insert access to patterns" ON bank_regex_patterns
    FOR INSERT WITH CHECK (true);

-- Policy to allow all users to update patterns
CREATE POLICY "Allow update access to patterns" ON bank_regex_patterns
    FOR UPDATE USING (true);

-- Insert initial generic patterns from the hardcoded constants
INSERT INTO bank_regex_patterns (bank_preset, pattern, priority, is_ai_generated, notes) VALUES
('generic', 'UPI\/([^\/]+)\/[^\/]+\/?', 10, false, 'Generic UPI pattern: UPI/COUNTERPARTY/number/optional'),
('generic', '(?:NEFT|RTGS)\/[^\/]+\/([^\\\n]+)\/?', 20, false, 'Generic NEFT/RTGS pattern'),
('generic', 'POS\/([^\\\n]+)\/?', 30, false, 'Generic POS pattern'),
('generic', 'IMPS(?:-[A-Z]+)?\/[^\/]+\/[^\/]+\/([^\\\n]+)\/?', 40, false, 'Generic IMPS pattern'),
('generic', '(?:.*\/)?([^\\\n]+)$', 50, false, 'Generic fallback: last segment after slash'),
('axis', '^NEFT/[A-Z0-9/]+/([^/]+)', 10, false, 'Axis Bank NEFT pattern'),
('axis', '^INB/NEFT/[A-Z0-9/]+/([^/]+)', 20, false, 'Axis Bank INB NEFT pattern'),
('axis', '^INB/RTGS/[A-Z0-9/]+/([^/]+)', 30, false, 'Axis Bank INB RTGS pattern'),
('axis', '^RTGS/[A-Z0-9/]+/([^/]+)', 40, false, 'Axis Bank RTGS pattern'),
('axis', '^IMPS/P2A/[0-9]+(?:/[^/]*)*/([^/]+)$', 50, false, 'Axis Bank IMPS P2A pattern'),
('axis', '^TRF/[^/]+/([^/]+)', 60, false, 'Axis Bank transfer pattern'),
('idfc', '^(?:NEFT|RTGS)/[^/]+/([^/]+)/[^/]+', 10, false, 'IDFC First Bank NEFT/RTGS pattern'),
('idfc', '^IMPS-[^/]+/Fund Trf/[^/]+/([^/]+)/', 20, false, 'IDFC First Bank IMPS pattern'),
('idfc', '^TRANSFER (?:TO|FROM) DEPOSIT: CHEQUE NO\. \d+/FT TO (.+)', 30, false, 'IDFC First Bank cheque transfer pattern'),
('idfc', '^IFT/[^/]+/([^/\\\r\n]*)', 40, false, 'IDFC First Bank IFT pattern'),
('idfc', '^CHQ Paid/[^/]+/([^/]+)/', 50, false, 'IDFC First Bank cheque paid pattern'),
('idfc', '^CASH DEPOSIT AT [^/]+ BY (.+)', 60, false, 'IDFC First Bank cash deposit pattern'),
('federal', '^(?:RTG|NFT|FTIMPS|IFN\/CHRG|CHRG|dd\sissue|DD:|BBYT:|TFR:?)\/??:?\s*(?:IFI\/\d+\/)?([^\/:,\n]+)', 10, false, 'Federal Bank transfer pattern'),
('federal', '^(ALLOYS?|LLP|BANK|ICICI|SBI|HDFC|PAYMENT?|Pymt|SELF)$', 20, false, 'Federal Bank entity pattern'),
('federal', '^(?:TFR:|ID\s*:\s*\[[^\]]*\]\s*:|BillId\s*:\s*\[[^\]]*\]\s*:)\s*"?([^",:\n\/]+?)\"?$', 30, false, 'Federal Bank reference pattern'),
('federal', '^FT?\s*IMPS\/IFI\/\d+\/([^\/]+)\/SUPP', 40, false, 'Federal Bank IMPS pattern'),
('indian', '\/[A-Z]{3,}\/([^\/-]+)(?:\/-)?$', 10, false, 'Indian Bank code pattern'),
('indian', 'RTGS\s+\S+\s+(.+)$', 20, false, 'Indian Bank RTGS pattern'),
('indian', '^TRANSFER (?:TO|FROM) \d+ [^\/]*?\/P[Aa]y\/([^\/\r\n\"]+?)(?:\/|$)', 30, false, 'Indian Bank transfer to Pay pattern'),
('indian', '^TRANSFER (?:TO|FROM) \d+ [^\/]*?\/IMPS\/P2A\/\d+\/ \/P[Aa]y\/([^\/]+?)\s*\/BRANCH', 40, false, 'Indian Bank IMPS Pay pattern'),
('indian', '\s([A-Z][A-Z0-9 &]+)$', 50, false, 'Indian Bank account name pattern'),
('indian', 'FROM (\d{8,15})$', 60, false, 'Indian Bank from account pattern'),
('indian', '^TRANSFER TO (\d{8,15})', 70, false, 'Indian Bank transfer to account pattern'),
('indian', 'Paid to SELF \/BRANCH\s*:\s*([^\/]+)', 80, false, 'Indian Bank SELF branch pattern'),
('jammu_and_kashmir_bank', '^UPI\/[A-Z]+\/\d+\/[CD]R\/([^\/]+)\/P2M', 10, false, 'J&K Bank UPI pattern'),
('jammu_and_kashmir_bank', '^NEFT-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])', 20, false, 'J&K Bank NEFT pattern'),
('jammu_and_kashmir_bank', '^RTGS-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])', 30, false, 'J&K Bank RTGS pattern'),
('jammu_and_kashmir_bank', '^mTFR\/\d+\/([A-Za-z][A-Za-z\s]*[A-Za-z])', 40, false, 'J&K Bank mobile transfer pattern');

-- Create a function to update pattern statistics
CREATE OR REPLACE FUNCTION update_regex_pattern_stats(
    p_pattern_id UUID,
    p_success BOOLEAN,
    p_increment INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    UPDATE bank_regex_patterns
    SET
        usage_count = usage_count + p_increment,
        success_rate = CASE
            WHEN p_success THEN
                ROUND(((success_rate * usage_count) + p_increment) / (usage_count + p_increment) * 100) / 100
            ELSE
                ROUND(((success_rate * usage_count) + 0) / (usage_count + p_increment) * 100) / 100
        END,
        updated_at = NOW()
    WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql;

-- Create a view for active patterns with stats
CREATE VIEW active_bank_regex_patterns AS
SELECT
    id,
    bank_preset,
    pattern,
    priority,
    success_rate,
    usage_count,
    is_ai_generated,
    created_at,
    updated_at,
    created_by,
    version,
    notes
FROM bank_regex_patterns
WHERE is_active = true
ORDER BY priority ASC, success_rate DESC;