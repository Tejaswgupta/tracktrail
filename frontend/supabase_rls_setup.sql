-- SQL Migration for Bank Statement Analyzer
-- Run this in your Supabase SQL Editor to set up Row Level Security

-- Enable RLS on cases table (if not already enabled)
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users (including anonymous) to insert cases
CREATE POLICY "Allow authenticated users to insert cases" ON cases
FOR INSERT TO authenticated
WITH CHECK (true);

-- Create policy to allow anonymous users to insert cases (temporary for development)
CREATE POLICY "Allow anonymous users to insert cases" ON cases
FOR INSERT TO anon
WITH CHECK (true);

-- Create policy to allow authenticated users to select cases
CREATE POLICY "Allow authenticated users to select cases" ON cases
FOR SELECT TO authenticated
USING (true);

-- Create policy to allow anonymous users to select cases (temporary for development)
CREATE POLICY "Allow anonymous users to select cases" ON cases
FOR SELECT TO anon
USING (true);

-- Create policy to allow authenticated users to update cases they created
CREATE POLICY "Allow users to update their own cases" ON cases
FOR UPDATE TO authenticated
USING (auth.uid()::text = created_by)
WITH CHECK (auth.uid()::text = created_by);

-- Create policy to allow authenticated users to delete cases they created
CREATE POLICY "Allow users to delete their own cases" ON cases
FOR DELETE TO authenticated
USING (auth.uid()::text = created_by);

-- If you want to allow all authenticated users to see all cases (common for law enforcement):
-- DROP POLICY "Allow authenticated users to select cases" ON cases;
-- CREATE POLICY "Allow authenticated users to select all cases" ON cases
-- FOR SELECT TO authenticated
-- USING (true);

-- If you want to allow all authenticated users to update any case:
-- DROP POLICY "Allow users to update their own cases" ON cases;
-- CREATE POLICY "Allow authenticated users to update any case" ON cases
-- FOR UPDATE TO authenticated
-- USING (true)
-- WITH CHECK (true);

-- ========================================
-- ENTITIES TABLE POLICIES
-- ========================================

-- Enable RLS on entities table
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to insert entities
CREATE POLICY "Allow authenticated users to insert entities" ON entities
FOR INSERT TO authenticated
WITH CHECK (true);

-- Create policy to allow anonymous users to insert entities (temporary for development)
CREATE POLICY "Allow anonymous users to insert entities" ON entities
FOR INSERT TO anon
WITH CHECK (true);

-- Create policy to allow authenticated users to select entities
CREATE POLICY "Allow authenticated users to select entities" ON entities
FOR SELECT TO authenticated
USING (true);

-- Create policy to allow anonymous users to select entities (temporary for development)
CREATE POLICY "Allow anonymous users to select entities" ON entities
FOR SELECT TO anon
USING (true);

-- Create policy to allow authenticated users to update entities
CREATE POLICY "Allow authenticated users to update entities" ON entities
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

-- ========================================
-- CASE_ENTITIES TABLE POLICIES
-- ========================================

-- Enable RLS on case_entities table
ALTER TABLE case_entities ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to insert case_entities
CREATE POLICY "Allow authenticated users to insert case_entities" ON case_entities
FOR INSERT TO authenticated
WITH CHECK (true);

-- Create policy to allow anonymous users to insert case_entities (temporary for development)
CREATE POLICY "Allow anonymous users to insert case_entities" ON case_entities
FOR INSERT TO anon
WITH CHECK (true);

-- Create policy to allow authenticated users to select case_entities
CREATE POLICY "Allow authenticated users to select case_entities" ON case_entities
FOR SELECT TO authenticated
USING (true);

-- Create policy to allow anonymous users to select case_entities (temporary for development)
CREATE POLICY "Allow anonymous users to select case_entities" ON case_entities
FOR SELECT TO anon
USING (true);

-- ========================================
-- ACCOUNTS TABLE POLICIES
-- ========================================

-- Enable RLS on accounts table
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to insert accounts
CREATE POLICY "Allow authenticated users to insert accounts" ON accounts
FOR INSERT TO authenticated
WITH CHECK (true);

-- Create policy to allow anonymous users to insert accounts (temporary for development)
CREATE POLICY "Allow anonymous users to insert accounts" ON accounts
FOR INSERT TO anon
WITH CHECK (true);

-- Create policy to allow authenticated users to select accounts
CREATE POLICY "Allow authenticated users to select accounts" ON accounts
FOR SELECT TO authenticated
USING (true);

-- Create policy to allow anonymous users to select accounts (temporary for development)
CREATE POLICY "Allow anonymous users to select accounts" ON accounts
FOR SELECT TO anon
USING (true);

-- ========================================
-- BANK_STATEMENTS TABLE POLICIES
-- ========================================

-- Enable RLS on bank_statements table
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to insert bank_statements
CREATE POLICY "Allow authenticated users to insert bank_statements" ON bank_statements
FOR INSERT TO authenticated
WITH CHECK (true);

-- Create policy to allow anonymous users to insert bank_statements (temporary for development)
CREATE POLICY "Allow anonymous users to insert bank_statements" ON bank_statements
FOR INSERT TO anon
WITH CHECK (true);

-- Create policy to allow authenticated users to select bank_statements
CREATE POLICY "Allow authenticated users to select bank_statements" ON bank_statements
FOR SELECT TO authenticated
USING (true);

-- Create policy to allow anonymous users to select bank_statements (temporary for development)
CREATE POLICY "Allow anonymous users to select bank_statements" ON bank_statements
FOR SELECT TO anon
USING (true);

-- Create policy to allow authenticated users to update bank_statements
CREATE POLICY "Allow authenticated users to update bank_statements" ON bank_statements
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

-- Create policy to allow anonymous users to update bank_statements (temporary for development)
CREATE POLICY "Allow anonymous users to update bank_statements" ON bank_statements
FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- Create policy to allow authenticated users to delete bank_statements
CREATE POLICY "Allow authenticated users to delete bank_statements" ON bank_statements
FOR DELETE TO authenticated
USING (true);

-- Create policy to allow anonymous users to delete bank_statements (temporary for development)
CREATE POLICY "Allow anonymous users to delete bank_statements" ON bank_statements
FOR DELETE TO anon
USING (true);