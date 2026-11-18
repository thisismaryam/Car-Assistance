import math
import re
from typing import Any
from app.knowledge.approved_knowledge import APPROVED_DOCUMENTS


def _tokenize(text: str) -> list[str]:
    return [w.lower() for w in re.findall(r"\w+", text) if len(w) > 2]


class GroundedRAGRetriever:
    """
    FEATURE 5 - Branch 1: Grounded RAG retrieval over approved documentation for knowledge queries.
    Retrieves the most relevant passages from official approved documentation and generates
    grounded responses with exact source citations.
    """

    def __init__(self, documents: list[dict[str, Any]] = APPROVED_DOCUMENTS):
        self.documents = documents

    def retrieve(self, query: str, top_k: int = 2) -> list[dict[str, Any]]:
        query_tokens = _tokenize(query)
        if not query_tokens:
            return self.documents[:top_k]

        scored_docs = []
        for doc in self.documents:
            doc_text = f"{doc['title']} {doc['category']} {doc['content']}"
            doc_tokens = _tokenize(doc_text)
            doc_token_counts = {}
            for t in doc_tokens:
                doc_token_counts[t] = doc_token_counts.get(t, 0) + 1

            # Simple TF-based matching score
            score = 0.0
            for qt in query_tokens:
                if qt in doc_token_counts:
                    score += 1.0 + math.log(1.0 + doc_token_counts[qt])

            if score > 0:
                scored_docs.append((score, doc))

        scored_docs.sort(key=lambda x: x[0], reverse=True)
        results = [doc for _, doc in scored_docs[:top_k]]
        if not results:
            results = self.documents[:top_k]
        return results

    def answer_knowledge_query(self, query: str) -> str:
        matched = self.retrieve(query, top_k=2)
        if not matched:
            return (
                "According to our approved operating documentation, Car Assistance offers full Workshop, "
                "Doorstep Home, and 24/7 Roadside Assistance. Please ask our dispatch or review your dashboard for further details."
            )

        citations = []
        summaries = []
        for doc in matched:
            citations.append(f"[{doc['title']}]")
            # Pull sentences that match query terms or first sentences
            sentences = [s.strip() for s in doc['content'].split(". ") if s.strip()]
            q_terms = set(_tokenize(query))
            relevant_sentences = []
            for s in sentences:
                s_tokens = set(_tokenize(s))
                if s_tokens.intersection(q_terms):
                    relevant_sentences.append(s)

            if not relevant_sentences:
                relevant_sentences = sentences[:2]
            summaries.append(". ".join(relevant_sentences[:3]) + ".")

        response_body = " ".join(summaries)
        citation_str = " (Source: " + ", ".join(citations) + ")"
        return response_body + citation_str


rag_retriever = GroundedRAGRetriever()
