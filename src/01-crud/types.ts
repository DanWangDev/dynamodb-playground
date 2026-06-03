/** Domain types for the Books table (Module 01: Core CRUD) */

export interface Book {
  isbn: string;
  title: string;
  author: string;
  pageCount?: number;
  tags?: string[];
  published?: string;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateBookInput = Pick<Book, "isbn" | "title" | "author"> & {
  pageCount?: number;
  tags?: string[];
  published?: string;
  rating?: number;
};

export type UpdateBookInput = {
  isbn: string;
  title?: string;
  author?: string;
  pageCount?: number;
  tags?: string[];
  published?: string;
  rating?: number;
};
