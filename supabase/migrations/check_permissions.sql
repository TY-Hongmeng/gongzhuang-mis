-- Check current permissions for cutting_orders table
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
AND table_name = 'cutting_orders' 
AND grantee IN ('anon', 'authenticated') 
ORDER BY privilege_type;