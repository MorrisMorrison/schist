import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	documentsStore,
	searchStore,
	foldersStore,
	documentActions,
	searchActions,
	currentFolderDocuments,
	currentFolder,
	resetAllState,
	setDocumentsState,
	setSearchState,
	setCurrentFolderState
} from './documents.svelte';
import { apiClient } from '../api/client';
import type { CreateDocumentRequest, UpdateDocumentRequest } from '../api/types';
import { testData } from '../test/utils';

// Mock the API client
vi.mock('../api/client', () => ({
	apiClient: {
		getDocuments: vi.fn(),
		getDocument: vi.fn(),
		getDocumentByPath: vi.fn(),
		createDocument: vi.fn(),
		updateDocument: vi.fn(),
		updateDocumentByPath: vi.fn(),
		deleteDocumentByPath: vi.fn(),
		moveDocument: vi.fn(),
		searchDocuments: vi.fn(),
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

		it('should have correct initial state for search store', () => {
			expect(searchStore.query).toEqual('');
			expect(searchStore.selectedTags).toEqual([]);
			expect(searchStore.results).toEqual([]);
			expect(searchStore.loading).toEqual(false);
			expect(searchStore.error).toEqual(null);
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

				expect(documentsStore.documents).toContain(createdDocument);
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

				await documentActions.deleteDocument(docToDelete.metaData.path);

				expect(apiClient.deleteDocumentByPath).toHaveBeenCalledWith(docToDelete.metaData.path);

				expect(documentsStore.documents).toEqual([]);
				expect(documentsStore.currentDocument).toBeNull();
				expect(documentsStore.loading).toBe(false);
			});
		});
	});

	describe('Search Actions', () => {
		describe('search', () => {
			it('should perform search successfully', async () => {
				const mockResults = [testData.document];
				vi.mocked(apiClient.searchDocuments).mockResolvedValue({
					documents: mockResults,
					query: 'test query tag:tag1',
					total: mockResults.length
				});

				const result = await searchActions.search('test query', ['tag1']);

				expect(apiClient.searchDocuments).toHaveBeenCalledWith('test query tag:tag1');
				expect(result.documents).toEqual(mockResults);

				expect(searchStore.query).toBe('test query');
				expect(searchStore.selectedTags).toEqual(['tag1']);
				expect(searchStore.results).toEqual(mockResults);
				expect(searchStore.loading).toBe(false);
			});

			it('should handle search error', async () => {
				const errorMessage = 'Search failed';
				vi.mocked(apiClient.searchDocuments).mockRejectedValue(new Error(errorMessage));

				await expect(searchActions.search('query')).rejects.toThrow(errorMessage);

				expect(searchStore.loading).toBe(false);
				expect(searchStore.error).toBe(errorMessage);
				expect(searchStore.results).toEqual([]);
			});
		});

		describe('clearSearch', () => {
			it('should clear search state', () => {
				setSearchState({
					query: 'test',
					selectedTags: ['tag1'],
					results: [testData.document],
					loading: false,
					error: 'error'
				});

				searchActions.clearSearch();

				expect(searchStore.query).toEqual('');
				expect(searchStore.selectedTags).toEqual([]);
				expect(searchStore.results).toEqual([]);
				expect(searchStore.loading).toEqual(false);
				expect(searchStore.error).toEqual(null);
			});
		});

		describe('tag management', () => {
			it('should add tag', () => {
				searchActions.addTag('newtag');

				expect(searchStore.selectedTags).toContain('newtag');
			});

			it('should not add duplicate tag', () => {
				setSearchState({
					query: '',
					selectedTags: ['existing'],
					results: [],
					loading: false,
					error: null
				});

				searchActions.addTag('existing');

				expect(searchStore.selectedTags).toEqual(['existing']);
			});

			it('should remove tag', () => {
				setSearchState({
					query: '',
					selectedTags: ['tag1', 'tag2'],
					results: [],
					loading: false,
					error: null
				});

				searchActions.removeTag('tag1');

				expect(searchStore.selectedTags).toEqual(['tag2']);
			});

			it('should clear all tags', () => {
				setSearchState({
					query: '',
					selectedTags: ['tag1', 'tag2'],
					results: [],
					loading: false,
					error: null
				});

				searchActions.clearTags();

				expect(searchStore.selectedTags).toEqual([]);
			});
		});
	});

	describe('Current Folder Documents', () => {
		it('should filter documents for root folder', () => {
			const docs = [
				{ ...testData.document, metaData: { ...testData.document.metaData, path: '/doc1' } },
				{ ...testData.document, metaData: { ...testData.document.metaData, path: '/folder/doc2' } },
				{ ...testData.document, metaData: { ...testData.document.metaData, path: '/' } }
			];

			setDocumentsState({
				documents: docs,
				currentDocument: null,
				loading: false,
				error: null
			});

			setCurrentFolderState('/');

			const folderDocs = currentFolderDocuments();
			expect(folderDocs).toHaveLength(2); // Should include /doc1 and / but not /folder/doc2
		});

		it('should filter documents for specific folder', () => {
			const docs = [
				{ ...testData.document, metaData: { ...testData.document.metaData, path: '/folder/doc1' } },
				{
					...testData.document,
					metaData: { ...testData.document.metaData, path: '/folder/subfolder/doc2' }
				},
				{ ...testData.document, metaData: { ...testData.document.metaData, path: '/other/doc3' } }
			];

			setDocumentsState({
				documents: docs,
				currentDocument: null,
				loading: false,
				error: null
			});

			setCurrentFolderState('/folder');

			const folderDocs = currentFolderDocuments();
			expect(folderDocs).toHaveLength(2); // Should include docs in /folder and subfolders
			expect(folderDocs.every((doc) => doc.metaData.path?.startsWith('/folder'))).toBe(true);
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
