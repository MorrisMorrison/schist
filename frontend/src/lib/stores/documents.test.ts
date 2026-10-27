import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	documentsStore,
	foldersStore,
	documentActions,
	currentFolder,
	resetAllState,
	setDocumentsState
} from './documents.svelte';
import { apiClient } from '#lib/api/client.ts';
import type { CreateDocumentRequest, UpdateDocumentRequest } from '../api/types';
import { testData } from '../test/utils';

// Mock the API client
vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocument: vi.fn(),
		getDocumentByPath: vi.fn(),
		createDocument: vi.fn(),
		updateDocument: vi.fn(),
		updateDocumentByPath: vi.fn(),
		deleteDocumentByPath: vi.fn(),
		moveDocument: vi.fn(),
		getFolderTree: vi.fn(),
		createFolder: vi.fn(),
		renameFolder: vi.fn(),
		deleteFolder: vi.fn(),
		moveFolder: vi.fn(),
		getDocumentBacklinks: vi.fn(),
		getDocumentOutgoingLinks: vi.fn(),
		checkDocumentExists: vi.fn()
	}
}));

describe('Documents Store', () => {
	beforeEach(() => {
		// Reset all stores to initial state
		resetAllState();

		// Clear all mocks
		vi.clearAllMocks();
	});

	describe('Initial State', () => {
		it('should have correct initial state for documents store', () => {
			expect(documentsStore.documents).toEqual([]);
			expect(documentsStore.currentDocument).toEqual(null);
			expect(documentsStore.loading).toEqual(false);
			expect(documentsStore.error).toEqual(null);
		});

		it('should have correct initial state for folders store', () => {
			expect(foldersStore.folders).toEqual([]);
			expect(foldersStore.loading).toEqual(false);
			expect(foldersStore.error).toEqual(null);
		});
	});

	describe('Document Actions', () => {
		describe('loadDocuments', () => {
			it('should load documents successfully', async () => {
				const mockDocuments = [testData.document];
				vi.mocked(apiClient.getDocuments).mockResolvedValue(mockDocuments);

				const result = await documentActions.loadDocuments();

				expect(apiClient.getDocuments).toHaveBeenCalledWith(false);
				expect(result).toEqual(mockDocuments);

				expect(documentsStore.documents).toEqual(mockDocuments);
				expect(documentsStore.loading).toBe(false);
				expect(documentsStore.error).toBeNull();
			});

			it('should handle loading documents error', async () => {
				const errorMessage = 'Failed to fetch documents';
				vi.mocked(apiClient.getDocuments).mockRejectedValue(new Error(errorMessage));

				const result = await documentActions.loadDocuments();

				expect(result).toEqual([]);

				expect(documentsStore.documents).toEqual([]);
				expect(documentsStore.loading).toBe(false);
				expect(documentsStore.error).toBe(errorMessage);
			});

			it('should force refresh when requested', async () => {
				vi.mocked(apiClient.getDocuments).mockResolvedValue([]);

				await documentActions.loadDocuments(true);

				expect(apiClient.getDocuments).toHaveBeenCalledWith(true);
			});
		});

		describe('loadDocument', () => {
			it('should load document by path and set current folder', async () => {
				const mockDocument = {
					...testData.document,
					metaData: { ...testData.document.metaData, path: '/folder/document' }
				};
				vi.mocked(apiClient.getDocumentByPath).mockResolvedValue(mockDocument);

				const result = await documentActions.loadDocument('/folder/document');

				expect(apiClient.getDocumentByPath).toHaveBeenCalledWith('/folder/document');
				expect(result).toEqual(mockDocument);
				expect(currentFolder.value).toBe('/folder');

				expect(documentsStore.currentDocument).toEqual(mockDocument);
				expect(documentsStore.loading).toBe(false);
				expect(documentsStore.error).toBeNull();
			});

			it('should load document by ID', async () => {
				const mockDocument = {
					...testData.document,
					metaData: { ...testData.document.metaData, path: '/folder/document' }
				};
				vi.mocked(apiClient.getDocument).mockResolvedValue(mockDocument);

				const result = await documentActions.loadDocument('doc-id');

				expect(apiClient.getDocument).toHaveBeenCalledWith('doc-id');
				expect(result).toEqual(mockDocument);
				expect(currentFolder.value).toBe('/folder');
			});

			it('should handle load document error', async () => {
				const errorMessage = 'Document not found';
				vi.mocked(apiClient.getDocumentByPath).mockRejectedValue(new Error(errorMessage));

				await expect(documentActions.loadDocument('/missing')).rejects.toThrow(errorMessage);

				expect(documentsStore.currentDocument).toBeNull();
				expect(documentsStore.loading).toBe(false);
				expect(documentsStore.error).toBe(errorMessage);
			});
		});

		describe('createDocument', () => {
			it('should create document successfully', async () => {
				const createRequest: CreateDocumentRequest = {
					metaData: {
						title: 'New Document',
						path: '/folder/new-document'
					},
					content: '# New Document'
				};

				const createdDocument = {
					metaData: {
						...createRequest.metaData,
						path: '/folder/new-document',
						slug: 'new-document',
						created: '2024-01-01T00:00:00Z',
						updated: '2024-01-01T00:00:00Z'
					},
					content: createRequest.content
				};
				vi.mocked(apiClient.createDocument).mockResolvedValue({
					message: 'Document created successfully',
					path: '/folder/new-document'
				});
				vi.mocked(apiClient.getDocumentByPath).mockResolvedValue(createdDocument);

				const result = await documentActions.createDocument(createRequest);

				expect(apiClient.createDocument).toHaveBeenCalledWith(createRequest);
				expect(apiClient.getDocumentByPath).toHaveBeenCalledWith('/folder/new-document');
				expect(result).toEqual(createdDocument);
				expect(currentFolder.value).toBe('/folder');

				expect(documentsStore.documents).toHaveLength(1);
				expect(documentsStore.documents[0]).toEqual(createdDocument);
				expect(documentsStore.currentDocument).toEqual(createdDocument);
				expect(documentsStore.loading).toBe(false);
			});

			it('should handle create document error', async () => {
				// Ensure clean state
				resetAllState();
				vi.clearAllMocks();

				const createRequest: CreateDocumentRequest = {
					metaData: { title: 'New Document' },
					content: '# New Document'
				};

				const errorMessage = 'Failed to create document';
				vi.mocked(apiClient.createDocument).mockRejectedValueOnce(new Error(errorMessage));

				// Verify initial state
				expect(documentsStore.documents).toEqual([]);

				await expect(documentActions.createDocument(createRequest)).rejects.toThrow(errorMessage);

				expect(documentsStore.documents).toEqual([]);
				expect(documentsStore.loading).toBe(false);
				expect(documentsStore.error).toBe(errorMessage);
			});
		});

		describe('updateDocument', () => {
			it('should update document successfully', async () => {
				const existingDoc = testData.document;
				setDocumentsState({
					documents: [existingDoc],
					currentDocument: existingDoc,
					loading: false,
					error: null
				});

				const updateRequest: UpdateDocumentRequest = {
					metaData: {
						title: 'Updated Title',
						path: existingDoc.metaData.path
					},
					content: '# Updated Content'
				};

				const updatedDocument = { ...existingDoc, ...updateRequest };
				vi.mocked(apiClient.updateDocument).mockResolvedValue(updatedDocument);

				const result = await documentActions.updateDocument(
					existingDoc.metaData.slug,
					updateRequest
				);

				expect(apiClient.updateDocument).toHaveBeenCalledWith(
					existingDoc.metaData.slug,
					updateRequest
				);
				expect(result).toEqual(updatedDocument);

				expect(documentsStore.documents[0]).toEqual(updatedDocument);
				expect(documentsStore.currentDocument).toEqual(updatedDocument);
			});
		});

		describe('deleteDocument', () => {
			it('should delete document successfully', async () => {
				const docToDelete = testData.document;
				setDocumentsState({
					documents: [docToDelete],
					currentDocument: docToDelete,
					loading: false,
					error: null
				});

				vi.mocked(apiClient.deleteDocumentByPath).mockResolvedValue();
				vi.mocked(apiClient.getDocuments).mockResolvedValue([]);

				await documentActions.deleteDocument(docToDelete.metaData.path);

				expect(apiClient.deleteDocumentByPath).toHaveBeenCalledWith(docToDelete.metaData.path);

				expect(documentsStore.documents).toEqual([]);
				expect(documentsStore.currentDocument).toBeNull();

				await new Promise((resolve) => setTimeout(resolve, 0));
				expect(documentsStore.loading).toBe(false);
			});
		});
	});

	describe('Error Handling', () => {
		it('should clear error for documents', () => {
			setDocumentsState({
				documents: [],
				currentDocument: null,
				loading: false,
				error: 'Test error'
			});

			documentActions.clearError();

			expect(documentsStore.error).toBeNull();
		});

		it('should clear current document', () => {
			setDocumentsState({
				documents: [],
				currentDocument: testData.document,
				loading: false,
				error: null
			});

			documentActions.clearCurrentDocument();

			expect(documentsStore.currentDocument).toBeNull();
		});
	});
});
