export interface DocumentMetaData {
	slug?: string;
	title: string;
	path: string;
	created?: string;
	updated?: string;
	tags?: string[];
}

export interface Document {
	metaData: DocumentMetaData;
	content: string;
}

export interface DocumentListResponse {
	documents: Document[];
	total: number;
}

export interface CreateDocumentRequest {
	metaData: Omit<DocumentMetaData, 'slug' | 'created' | 'updated' | 'path'> & { path?: string };
	content: string;
}

export interface CreateDocumentResponse {
	message: string;
	path: string;
}

export interface UpdateDocumentRequest {
	metaData: Omit<DocumentMetaData, 'created' | 'updated'> & { path?: string };
	content: string;
}

export interface SearchResult {
	documents: Document[];
	query: string;
	total: number;
}

export interface TagInfo {
	name: string;
	count: number;
}

export interface TagsResponse {
	tags: TagInfo[];
	total: number;
}

export interface WikiLink {
	target: string;
	display_text: string;
	path: string;
	is_valid: boolean;
}

export interface OutgoingLinksResponse {
	path: string;
	links: WikiLink[];
	total: number;
}

export interface GraphNode {
	id: string;
	title: string;
	path: string;
	type: 'current' | 'backlink' | 'outgoing';
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
}

export interface GraphLink {
	source: string;
	target: string;
	type: 'backlink' | 'outgoing';
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

export interface Template {
	id: string;
	title: string;
	description: string;
	tags: string[];
	category: string;
	content: string;
	metadata: Record<string, string>;
}

export interface TemplatesResponse {
	templates: Template[];
	total: number;
}

export interface ApiResponse<T> {
	data?: T;
	error?: string;
	success: boolean;
}

export interface HealthResponse {
	status: string;
	timestamp: string;
}

export interface Asset {
	name: string;
	original_name: string;
	path: string;
	size: number;
	content_type: string;
	created: string;
}

export interface AssetUploadResponse {
	message: string;
	asset: Asset;
}

export interface AssetUploadError {
	error: string;
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public response?: Response
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export interface Folder {
	name: string;
	path: string;
	created: string;
	document_count: number;
	sub_folders: Folder[];
}

export interface FolderTreeResponse {
	folders: Folder[];
	total: number;
}

export interface MoveDocumentRequest {
	oldPath: string;
	newPath: string;
}

export interface FolderOperationResponse {
	message: string;
	path: string;
}

export interface MoveDocumentResponse {
	message: string;
	oldPath: string;
	newPath: string;
}

export interface DocumentVersion {
	hash: string;
	message: string;
	author: string;
	timestamp: string;
	file_path: string;
}

export interface VersionsResponse {
	path: string;
	versions: DocumentVersion[];
	total: number;
}

// Version comparison interfaces
export interface DiffLine {
	type: 'addition' | 'deletion' | 'modification' | 'context';
	content: string;
	old_line?: number;
	new_line?: number;
}

export interface DiffSummary {
	additions: number;
	deletions: number;
	modifications: number;
}

export interface DiffResult {
	path: string;
	hash1: string;
	hash2: string;
	lines: DiffLine[];
	summary: DiffSummary;
}

export interface RestoreResponse {
	message: string;
	path: string;
	hash: string;
}

export interface ImportOptions {
	target_path: string;
	overwrite_mode: 'skip' | 'overwrite' | 'rename';
}

export interface ImportedDocument {
	original_name: string;
	final_path: string;
	title: string;
}

export interface ImportError {
	original_name: string;
	error: string;
}

export interface ImportResult {
	success: ImportedDocument[];
	failed: ImportError[];
	skipped: ImportedDocument[];
	total_files: number;
	imported_count: number;
	failed_count: number;
	skipped_count: number;
}

// Export-related types
export type ExportType = 'document' | 'folder' | 'all';

export interface ExportOptions {
	path?: string;
	type: ExportType;
	format?: string; // "zip" or "markdown"
	include_meta?: boolean;
}

// GitHub integration types
export interface GitHubConfig {
	token: string;
	owner: string;
	repository: string;
	branch: string;
}

export interface GitHubSettings {
	enabled: boolean;
	owner: string;
	repository: string;
	branch: string;
	auto_sync: boolean;
	sync_on_save: boolean;
	last_sync?: string;
	last_sync_error?: string;
}

export interface GitHubConnectionStatus {
	connected: boolean;
	token_exists: boolean;
	pending_changes: number;
}

export interface GitHubSyncResult {
	success: boolean;
	message: string;
	syncedFiles?: number;
	errors?: string[];
	timestamp: string;
}

export interface GitHubSetupRequest {
	token: string;
	owner: string;
	repo: string;
	branch?: string;
	auto_sync?: boolean;
	sync_on_save?: boolean;
}

export interface GitHubConfigRequest {
	auto_sync?: boolean;
	sync_on_save?: boolean;
	branch?: string;
}

export interface GitHubConnectionTest {
	success: boolean;
	message: string;
	repositoryExists?: boolean;
	hasWriteAccess?: boolean;
}

export interface GitHubRepoInfo {
	owner: string;
	name: string;
	full_name: string;
	private: boolean;
	html_url: string;
}

export interface GitHubSetupResponse {
	message: string;
	repository: GitHubRepoInfo;
	settings?: GitHubSettings;
	connection?: GitHubConnectionStatus;
	auto_sync: boolean;
	sync_on_save: boolean;
}

export interface GitHubSyncResponse {
	message: string;
	success_count: number;
	failure_count: number;
	failures: string[];
}

// Authentication
export interface User {
	username: string;
	created_at: string;
	last_login: string;
}

export interface PasskeyLoginRequest {
	credentialId: string;
}

export interface LoginResponse {
	token: string;
	user: User;
}

export interface AuthError {
	error: string;
	message?: string;
}

export interface AppConfig {
	auth_enabled: boolean;
	sharing_enabled?: boolean;
}

// Share-related types
export interface ShareToken {
	id: string;
	document_path: string;
	token: string;
	share_url: string;
	created_at: string;
	expires_at: string;
	created_by: string;
}

export interface CreateShareRequest {
	document_path: string;
	expiry_days?: number;
}

export interface ShareListResponse {
	shares: ShareToken[];
	total: number;
}

// User management types
export interface UserInfo {
	username: string;
	passkey_ids: string[];
	is_admin: boolean;
	created_at: string;
	last_login: string;
}

// Setup types
export interface SetupStatusResponse {
	requires_setup: boolean;
}

export interface GenerateInviteTokenResponse {
	token: string;
	invite_url: string;
}

export interface CreateUserFromInviteRequest {
	token: string;
	username: string;
	credential_id: string;
}

export interface CreateFirstUserRequest {
	username: string;
	credential_id: string;
}

export interface CreateUserRequest {
	username: string;
	is_admin: boolean;
	credential_id: string;
}

export interface UserListResponse {
	users: User[];
}

// Passkey types
export interface PasskeyInfo {
	id: string;
	name: string;
	createdAt: string;
}

export interface PasskeyStatus {
	hasPasskeys: boolean;
	isUnlocked: boolean;
	requiresPassword: boolean;
}

export interface PasskeyCreateRequest {
	name: string;
}

export interface PasskeyCreateResponse {
	credentialId: string;
	message: string;
}

export interface PasskeyUnlockRequest {
	credentialId: string;
}

export interface PasskeyListResponse {
	passkeys: PasskeyInfo[];
}

// WebAuthn types
export interface WebAuthnBeginRegistrationRequest {
	name: string;
}

export interface WebAuthnBeginRegistrationResponse {
	options: {
		publicKey: PublicKeyCredentialCreationOptions;
	};
	sessionId: string;
}

export interface WebAuthnFinishRegistrationRequest {
	name: string;
	sessionId: string;
	response: RegistrationResponseJSON;
}

export interface WebAuthnFinishRegistrationResponse {
	credentialId: string;
	message: string;
}

export interface WebAuthnBeginAuthenticationResponse {
	options: {
		publicKey: PublicKeyCredentialRequestOptions;
	};
	sessionId: string;
}

export interface WebAuthnFinishAuthenticationRequest {
	sessionId: string;
	response: AuthenticationResponseJSON;
}

export interface WebAuthnFinishAuthenticationResponse {
	credentialId: string;
	message: string;
}

// WebAuthn credential types from @simplewebauthn/types
export interface RegistrationResponseJSON {
	id: string;
	rawId: string;
	response: AuthenticatorAttestationResponseJSON;
	authenticatorAttachment?: AuthenticatorAttachment;
	clientExtensionResults: AuthenticationExtensionsClientOutputs;
	type: PublicKeyCredentialType;
}

export interface AuthenticationResponseJSON {
	id: string;
	rawId: string;
	response: AuthenticatorAssertionResponseJSON;
	authenticatorAttachment?: AuthenticatorAttachment;
	clientExtensionResults: AuthenticationExtensionsClientOutputs;
	type: PublicKeyCredentialType;
}

export interface AuthenticatorAttestationResponseJSON {
	clientDataJSON: string;
	attestationObject: string;
	authenticatorData?: string;
	transports?: AuthenticatorTransport[];
	publicKeyAlgorithm?: COSEAlgorithmIdentifier;
	publicKey?: string;
}

export interface AuthenticatorAssertionResponseJSON {
	clientDataJSON: string;
	authenticatorData: string;
	signature: string;
	userHandle?: string;
}

type COSEAlgorithmIdentifier = number;

// Secret management types
export interface SecretsStatus {
	unlocked: boolean;
	has_secrets: boolean;
	requires_password: boolean;
	has_passkeys: boolean;
	requires_setup: boolean;
}

// UnlockSecretsRequest removed - using passkey-only authentication

export interface CreateSecretRequest {
	key: string;
	value: string;
}

export interface UpdateSecretRequest {
	value: string;
}

export interface SecretListResponse {
	secrets: string[];
}

export interface SecretValueResponse {
	value: string;
}
