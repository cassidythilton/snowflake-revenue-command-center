--------------------------------------------------------------------------------
-- Snowflake Revenue Command Center: Environment Setup
-- Idempotent DDL -- safe to re-run.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- SECTION 1: Warehouse, Database, Schema
-- Required executing role: SYSADMIN
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;

CREATE WAREHOUSE IF NOT EXISTS REVENUE_CC_WH
  WITH
    WAREHOUSE_SIZE   = 'XSMALL'
    WAREHOUSE_TYPE   = 'STANDARD'
    AUTO_SUSPEND     = 60
    AUTO_RESUME      = TRUE
    INITIALLY_SUSPENDED = TRUE
    COMMENT = 'Compute warehouse for the Snowflake Revenue Command Center demo.';

CREATE DATABASE IF NOT EXISTS SNOWFLAKE_REVENUE_CC
  COMMENT = 'Revenue Command Center application database.';

CREATE SCHEMA IF NOT EXISTS SNOWFLAKE_REVENUE_CC.CORE
  COMMENT = 'Core schema for revenue tables, views, and writeback state.';

--------------------------------------------------------------------------------
-- SECTION 2: Functional Roles (Least-Privilege for Code Engine Bridge)
--
-- Two roles implement least-privilege for the service identity:
--   REVENUE_CC_READER  - read/recommend path (Cortex Analyst/Agent/Search)
--   REVENUE_CC_WRITER  - approved writeback path (INSERT/UPDATE/DELETE on
--                        writeback and hybrid state tables)
--
-- Required executing role: SECURITYADMIN (or USERADMIN for role creation,
-- SECURITYADMIN for grants to roles)
--------------------------------------------------------------------------------

USE ROLE SECURITYADMIN;

-- Create roles
CREATE ROLE IF NOT EXISTS REVENUE_CC_READER
  COMMENT = 'Read-only access for Cortex Analyst, Agent, and Search operations.';

CREATE ROLE IF NOT EXISTS REVENUE_CC_WRITER
  COMMENT = 'Write access for approved writeback and hybrid state tables.';

-- REVENUE_CC_WRITER inherits all READER privileges
GRANT ROLE REVENUE_CC_READER TO ROLE REVENUE_CC_WRITER;

--------------------------------------------------------------------------------
-- SECTION 3: Grants to REVENUE_CC_READER
-- Required executing role: SECURITYADMIN
--------------------------------------------------------------------------------

-- Warehouse usage
GRANT USAGE ON WAREHOUSE REVENUE_CC_WH TO ROLE REVENUE_CC_READER;

-- Database and schema usage
GRANT USAGE ON DATABASE SNOWFLAKE_REVENUE_CC TO ROLE REVENUE_CC_READER;
GRANT USAGE ON SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;

-- SELECT on all current and future tables and views in CORE
GRANT SELECT ON ALL TABLES IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;
GRANT SELECT ON ALL VIEWS IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;

--------------------------------------------------------------------------------
-- SECTION 4: Grants to REVENUE_CC_WRITER
-- Required executing role: SECURITYADMIN
--
-- INSERT/UPDATE/DELETE on writeback and hybrid state tables.
-- Future-table grants cover tables created later in the writeback path.
--------------------------------------------------------------------------------

GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_WRITER;
GRANT INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_WRITER;

--------------------------------------------------------------------------------
-- SECTION 5: Roll roles up to SYSADMIN hierarchy
-- Required executing role: SECURITYADMIN
--------------------------------------------------------------------------------

GRANT ROLE REVENUE_CC_WRITER TO ROLE SYSADMIN;
-- READER is already inherited by WRITER, but grant directly to SYSADMIN for
-- explicit visibility in SHOW GRANTS.
GRANT ROLE REVENUE_CC_READER TO ROLE SYSADMIN;

--------------------------------------------------------------------------------
-- SECTION 6: Grants on generated objects (run after 10_data + 20_semantics)
-- Required executing role: SECURITYADMIN
--------------------------------------------------------------------------------

GRANT SELECT ON SEMANTIC VIEW SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST TO ROLE REVENUE_CC_READER;
GRANT SELECT ON ALL TABLES IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;
GRANT SELECT ON ALL VIEWS IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE TO ROLE REVENUE_CC_READER;
