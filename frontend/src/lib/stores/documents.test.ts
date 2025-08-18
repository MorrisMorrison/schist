import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	documentsStore,
	searchStore,
	foldersStore,
	documentActions,
	searchActions,
	currentFolderDocuments,
	currentFolder
} from './documents';
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
		documentsStore.set({
			documents: [],
			currentDocument: null,
			loading: false,
			error: null
		});

		searchStore.set({
			query: '',
			selectedTags: [],
			results: [],
			loading: false,
			error: null
		});

		foldersStore.set({
			folders: [],
			loading: false,
			error: null
		});

		currentFolder.set('/');

		// Clear all mocks
		vi.clearAllMocks();
	});

	describe('Initial State', () => {
		it('should have correct initial state for documents store', () => {
			const state = get(documentsStore);
			expect(state).toEqual({
				documents: [],
				currentDocument: null,
				loading: false,
				error: null
			});
		});

		it('should have correct initial state for search store', () => {
			const state = get(searchStore);
			expect(state).toEqual({
				query: '',
				selectedTags: [],
				results: [],
				loading: false,
				error: null
			});
		});

		it('should have correct initial state for folders store', () => {
			const state = get(foldersStore);
			expect(state).toEqual({
				folders: [],
				loading: false,
				error: null
			});
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

				const state = get(documentsStore);
				expect(state.documents).toEqual(mockDocuments);
				expect(state.loading).toBe(false);
				expect(state.error).toBeNull();
			});

			it('should handle loading documents error', async () => {
				const errorMessage = 'Failed to fetch documents';
				vi.mocked(apiClient.getDocuments).mockRejectedValue(new Error(errorMessage));

				const result = await documentActions.loadDocuments();

				expect(result).toEqual([]);

				const state = get(documentsStore);
				expect(state.documents).toEqual([]);
				expect(state.loading).toBe(false);
				expect(state.error).toBe(errorMessage);
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
				expect(get(currentFolder)).toBe('/folder');

				const state = get(documentsStore);
				expect(state.currentDocument).toEqual(mockDocument);
				expect(state.loading).toBe(false);
				expect(state.error).toBeNull();
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
				expect(get(currentFolder)).toBe('/folder');
			});

			it('should handle load document error', async () => {
				const errorMessage = 'Document not found';
				vi.mocked(apiClient.getDocumentByPath).mockRejectedValue(new Error(errorMessage));

				await expect(documentActions.loadDocument('/missing')).rejects.toThrow(errorMessage);

				const state = get(documentsStore);
				expect(state.currentDocument).toBeNull();
				expect(state.loading).toBe(false);
				expect(state.error).toBe(errorMessage);
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
				expect(get(currentFolder)).toBe('/folder');

				const state = get(documentsStore);
				expect(state.documents).toContain(createdDocument);
				expect(state.currentDocument).toEqual(createdDocument);
				expect(state.loading).toBe(false);
			});

			it('should handle create document error', async () => {
				const createRequest: CreateDocumentRequest = {
					metaData: { title: 'New Document' },
					content: '# New Document'
				};

				const errorMessage = 'Failed to create document';
				vi.mocked(apiClient.createDocument).mockRejectedValue(new Error(errorMessage));

				await expect(documentActions.createDocument(createRequest)).rejects.toThrow(errorMessage);

				const state = get(documentsStore);
				expect(state.documents).toEqual([]);
				expect(state.loading).toBe(false);
				expect(state.error).toBe(errorMessage);
			});
		});

		describe('updateDocument', () => {
			it('should update document successfully', async () => {
				const existingDoc = testData.document;
				documentsStore.set({
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

				const state = get(documentsStore);
				expect(state.documents[0]).toEqual(updatedDocument);
				expect(state.currentDocument).toEqual(updatedDocument);
			});
		});

		describe('deleteDocument', () => {
			it('should delete document successfully', async () => {
				const docToDelete = testData.document;
				documentsStore.set({
					documents: [docToDelete],
					currentDocument: docToDelete,
					loading: false,
					error: null
				});

				vi.mocked(apiClient.deleteDocumentByPath).mockResolvedValue();

				await documentActions.deleteDocument(docToDelete.metaData.path);

				expect(apiClient.deleteDocumentByPath).toHaveBeenCalledWith(docToDelete.metaData.path);

				const state = get(documentsStore);
				expect(state.documents).toEqual([]);
				expect(state.currentDocument).toBeNull();
				expect(state.loading).toBe(false);
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

				const state = get(searchStore);
				expect(state.query).toBe('test query');
				expect(state.selectedTags).toEqual(['tag1']);
				expect(state.results).toEqual(mockResults);
				expect(state.loading).toBe(false);
			});

			it('should handle search error', async () => {
				const errorMessage = 'Search failed';
				vi.mocked(apiClient.searchDocuments).mockRejectedValue(new Error(errorMessage));

				await expect(searchActions.search('query')).rejects.toThrow(errorMessage);

				const state = get(searchStore);
				expect(state.loading).toBe(false);
				expect(state.error).toBe(errorMessage);
				expect(state.results).toEqual([]);
			});
		});

		describe('clearSearch', () => {
			it('should clear search state', () => {
				searchStore.set({
					query: 'test',
					selectedTags: ['tag1'],
					results: [testData.document],
					loading: false,
					error: 'error'
				});

				searchActions.clearSearch();

				const state = get(searchStore);
				expect(state).toEqual({
					query: '',
					selectedTags: [],
					results: [],
					loading: false,
					error: null
				});
			});
		});

		describe('tag management', () => {
			it('should add tag', () => {
				searchActions.addTag('newtag');

				const state = get(searchStore);
				expect(state.selectedTags).toContain('newtag');
			});

			it('should not add duplicate tag', () => {
				searchStore.set({
					query: '',
					selectedTags: ['existing'],
					results: [],
					loading: false,
					error: null
				});

				searchActions.addTag('existing');

				const state = get(searchStore);
				expect(state.selectedTags).toEqual(['existing']);
			});

			it('should remove tag', () => {
				searchStore.set({
					query: '',
					selectedTags: ['tag1', 'tag2'],
					results: [],
					loading: false,
					error: null
				});

				searchActions.removeTag('tag1');

				const state = get(searchStore);
				expect(state.selectedTags).toEqual(['tag2']);
			});

			it('should clear all tags', () => {
				searchStore.set({
					query: '',
					selectedTags: ['tag1', 'tag2'],
					results: [],
					loading: false,
					error: null
				});

				searchActions.clearTags();

				const state = get(searchStore);
				expect(state.selectedTags).toEqual([]);
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

			documentsStore.set({
				documents: docs,
				currentDocument: null,
				loading: false,
				error: null
			});

			currentFolder.set('/');

			const folderDocs = get(currentFolderDocuments);
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

			documentsStore.set({
				documents: docs,
				currentDocument: null,
				loading: false,
				error: null
			});

			currentFolder.set('/folder');

			const folderDocs = get(currentFolderDocuments);
			expect(folderDocs).toHaveLength(2); // Should include docs in /folder and subfolders
			expect(folderDocs.every((doc) => doc.metaData.path?.startsWith('/folder'))).toBe(true);
		});
	});

	describe('Error Handling', () => {
		it('should clear error for documents', () => {
			documentsStore.set({
				documents: [],
				currentDocument: null,
				loading: false,
				error: 'Test error'
			});

			documentActions.clearError();

			const state = get(documentsStore);
			expect(state.error).toBeNull();
		});

		it('should clear current document', () => {
			documentsStore.set({
				documents: [],
				currentDocument: testData.document,
				loading: false,
				error: null
			});

			documentActions.clearCurrentDocument();

			const state = get(documentsStore);
			expect(state.currentDocument).toBeNull();
		});
	});
});
