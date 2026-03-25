import { Button } from "@/components/ui/button";
import { updateKnowledgebaseReviewStatus, type KnowledgebaseReviewStatus } from "@/lib/knowledgebase/data";

export function ReviewStatusForm({
  documentId,
  reviewStatus,
}: {
  documentId: string;
  reviewStatus: KnowledgebaseReviewStatus;
}) {
  return (
    <form action={updateKnowledgebaseReviewStatus} className="space-y-3">
      <input type="hidden" name="documentId" value={documentId} />
      <div className="space-y-1">
        <label htmlFor="review-status" className="text-xs font-medium text-muted-foreground">
          Review status
        </label>
        <select
          id="review-status"
          name="reviewStatus"
          defaultValue={reviewStatus}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="inbox">Inbox</option>
          <option value="reviewed">Reviewed</option>
          <option value="archived">Archived</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <Button type="submit" variant="outline" size="sm">
        Save status
      </Button>
    </form>
  );
}
