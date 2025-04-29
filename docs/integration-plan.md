# OpenAuth Integration Plan

## 1. Overview
This document outlines the integration of OpenAuth with our web application and sync system. The integration spans multiple components and requires careful coordination between authentication, data access, and real-time synchronization.

### 1.1 System Architecture
- **OpenAuth Worker**: Handles authentication and token management
- **Backend Service**: Manages user data and sync operations
- **Sync System**: Handles real-time data synchronization
- **Client Application**: Manages auth state and sync operations

### 1.2 Key Integration Points
- User authentication and token management (using `User` and `UserIdentity` tables)
- Row-level security (RLS) for data access (user-based initially)
- Real-time sync with proper access control (user-based)
- Change history tracking with user context (`userId`)

## 2. Server-Side Implementation

### 2.1 OpenAuth Worker
The OpenAuth worker serves as the central authentication service:

#### 2.1.1 Provider Configuration
- **Password Provider**: Email/password authentication
  - Secure password hashing
  - Rate limiting for login attempts
  - Password reset functionality
- **GitHub Provider**: OAuth-based authentication
  - OAuth app configuration
  - Scope management
  - User profile mapping

#### 2.1.2 Token Management
- JWT-based access tokens (containing `userId`)
- Secure refresh token rotation
- Token validation and verification
- Token storage in Cloudflare KV

#### 2.1.3 User Management
- User lookup/creation callbacks (handled by backend service)
- Profile data synchronization (managed by backend service)
- Session management
- Account linking capabilities (via `UserIdentity` table in backend)

### 2.2 Backend Service Integration

#### 2.2.1 User Management
- User creation and lookup: Implement `find-or-create` logic using `User` and `UserIdentity` tables.
  - Query `UserIdentity` by `provider` and `providerId`.
  - If found, return existing `userId`.
  - If not found, check for existing `User` by `email`.
  - If `User` exists, create new `UserIdentity` linked to it.
  - If `User` doesn't exist, create both `User` and `UserIdentity`.
- Profile data management (`User` table)
- ~~Workspace association~~ (Deferred for internal app)
- Role and permission management (`User.role`)

#### 2.2.2 Row-Level Security
- Table-level RLS policies
- User-based access control
- ~~Workspace-based access control~~ (Deferred for internal app)
- Dynamic policy evaluation

#### 2.2.3 Sync System Integration
- Auth token validation
- User context propagation (using `userId` from JWT)
- Access control enforcement (user-based)
- Change tracking with user context (`userId`)

### 2.3 Sync System Enhancements

#### 2.3.1 WebSocket Authentication
- Token validation in connections
- User context (`userId`) in sync operations
- Session management
- Connection lifecycle handling

#### 2.3.2 Change History Integration
- User-aware change tracking (`userId`)
- RLS-based change filtering (user-based)
- Efficient change querying
- Change propagation rules

#### 2.3.3 Access Control
- Real-time access validation
- ~~Workspace-based filtering~~ (Deferred for internal app)
- User role enforcement
- Permission checking

## 3. Client-Side Implementation

### 3.1 Auth Client

#### 3.1.1 OAuth Flow
- PKCE implementation
- State management
- Error handling
- Redirect handling

#### 3.1.2 Token Management
- Secure token storage
- Refresh token handling
- Token expiration management
- Automatic token refresh

#### 3.1.3 State Management
- Auth state persistence
- Session tracking
- User context management (`userId`)
- ~~Workspace context~~ (Deferred for internal app)

### 3.2 User Interface

#### 3.2.1 Auth Components
- Login/logout flows
- Provider selection
- Error feedback
- Loading states

#### 3.2.2 Protected Routes
- Route protection
- Auth state checks
- Redirect handling
- Error boundaries

#### 3.2.3 User Feedback
- Auth status indicators
- Error messages
- Loading states
- Success notifications

### 3.3 Sync Integration

#### 3.3.1 Auth-Aware Sync
- Token inclusion
- Refresh handling
- Error recovery
- State management

#### 3.3.2 Connection Management
- Auth-based reconnection
- Token refresh
- Error handling
- State recovery

#### 3.3.3 Error Handling
- Network errors
- Auth errors
- Sync errors
- User feedback

## 4. Security Implementation

### 4.1 Authentication Security

#### 4.1.1 Token Security
- Secure storage
- Rotation policies
- Validation rules
- Expiration handling

#### 4.1.2 Session Management
- Session tracking
- Invalidation rules
- Concurrent session handling
- Session recovery

#### 4.1.3 Provider Security
- OAuth security
- Scope validation
- Profile verification
- Account linking security (ensured by unique `UserIdentity` records)

### 4.2 Authorization

#### 4.2.1 RLS Policies
- Table policies
- User policies
- ~~Workspace policies~~ (Deferred for internal app scope)
- Dynamic policies

#### 4.2.2 Access Control
- Role-based access
- Permission checking
- Resource access
- Operation validation

#### 4.2.3 Workspace Security
- (Deferred/Simplified for internal app scope)
- ~~Workspace membership~~
- ~~Resource sharing~~
- ~~Access delegation~~
- ~~Permission inheritance~~

### 4.3 Data Protection

#### 4.3.1 Storage Security
- Token encryption
- Secure storage
- Data isolation
- Access control

#### 4.3.2 Network Security
- CORS configuration
- Security headers
- Rate limiting
- Request validation

#### 4.3.3 Input Validation
- Data sanitization
- Type checking
- Format validation
- Security checks

## 5. Error Handling

### 5.1 Server-Side Errors

#### 5.1.1 Auth Errors
- Token validation
- Provider errors
- Session errors
- Permission errors

#### 5.1.2 Sync Errors
- Connection errors
- Data errors
- Access errors
- State errors

#### 5.1.3 Database Errors
- Query errors
- Constraint errors
- Access errors
- Transaction errors

### 5.2 Client-Side Errors

#### 5.2.1 Network Errors
- Connection issues
- Timeout handling
- Retry logic
- Error recovery

#### 5.2.2 Auth Errors
- Token errors
- Session errors
- Provider errors
- Permission errors

#### 5.2.3 Sync Errors
- Connection errors
- Data errors
- State errors
- Recovery handling

## 6. Testing Strategy

### 6.1 Unit Testing

#### 6.1.1 Auth Testing
- Provider flows
- Token management
- Session handling
- Error cases

#### 6.1.2 Sync Testing
- Connection handling
- Data sync
- State management
- Error recovery

#### 6.1.3 Security Testing
- Access control
- Token security
- Session security
- Data protection

### 6.2 Integration Testing

#### 6.2.1 Auth Flows
- Complete auth cycles
- Provider integration
- Session management
- Error handling

#### 6.2.2 Sync Operations
- Data synchronization
- State management
- Error recovery
- Performance testing

#### 6.2.3 Security Testing
- Access control
- Data protection
- Session security
- Error handling

### 6.3 E2E Testing

#### 6.3.1 User Journeys
- Complete workflows
- Error scenarios
- Recovery paths
- Performance testing

#### 6.3.2 Security Testing
- Access control
- Data protection
- Session management
- Error handling

## 7. Implementation Phases

### 7.1 Phase 1: Core Auth (✅ Mostly Completed w/ Workaround)
- OpenAuth worker setup (✅ Completed - Includes workaround for `UnknownStateError`)
- Basic auth flows (Password ✅ Completed, GitHub ❓ Needs Testing)
- Token management (`userId` only in JWT) (✅ Completed - Via workaround)
- Initial security (baseline via framework) (✅ Completed)
- Backend `find-or-create` endpoint implemented (✅ Completed)

### 7.2 Phase 2: Sync Integration (⏳ Next Steps)
- RLS implementation (Implementing Row-Level Security policies based on `userId`)
- Change history (Integrating user-aware change tracking)
- WebSocket auth (Securing WebSocket connections with JWT validation)
- Token refresh (Implementing client-side token refresh logic)

### 7.3 Phase 3: Security
- Token management
- Access control
- Error handling
- Monitoring

### 7.4 Phase 4: Testing
- Comprehensive testing
- Security audit
- Performance testing
- Documentation

## 8. Documentation

### 8.1 Technical Documentation
- API specifications
- Security measures
- Sync integration
- Error handling

### 8.2 User Documentation
- Auth flows
- Error handling
- Security practices
- Troubleshooting 