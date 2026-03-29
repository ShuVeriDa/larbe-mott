import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AddMessageDto } from "./dto/add-message.dto";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { CreateReactionDto } from "./dto/create-reaction.dto";
import { GetFeedbackDto } from "./dto/get-feedback.dto";
import { FeedbackService } from "./feedback.service";

@ApiTags("feedback")
@ApiBearerAuth()
@Auth()
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: "Create feedback thread with first message" })
  createThread(@User("id") userId: string, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.createThread(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List my feedback threads" })
  getThreads(@User("id") userId: string, @Query() dto: GetFeedbackDto) {
    return this.feedbackService.getThreads(userId, dto);
  }

  @Get(":threadId")
  @ApiOperation({ summary: "Get thread with all messages" })
  getThread(
    @User("id") userId: string,
    @Param("threadId", ParseUUIDPipe) threadId: string,
  ) {
    return this.feedbackService.getThread(userId, threadId);
  }

  @Patch(":threadId/read")
  @HttpCode(200)
  @ApiOperation({ summary: "Mark all admin messages in thread as read" })
  markAsRead(
    @User("id") userId: string,
    @Param("threadId", ParseUUIDPipe) threadId: string,
  ) {
    return this.feedbackService.markAsRead(userId, threadId);
  }

  @Post(":threadId/messages")
  @ApiOperation({ summary: "Add message to thread (mini-chat)" })
  addMessage(
    @User("id") userId: string,
    @Param("threadId", ParseUUIDPipe) threadId: string,
    @Body() dto: AddMessageDto,
  ) {
    return this.feedbackService.addMessage(userId, threadId, dto);
  }

  @Post("reactions")
  @ApiOperation({ summary: "Toggle quick reaction (👍 👎 🤯)" })
  createReaction(
    @User("id") userId: string,
    @Body() dto: CreateReactionDto,
  ) {
    return this.feedbackService.createReaction(userId, dto);
  }

  @Delete("reactions/:reactionId")
  @ApiOperation({ summary: "Delete reaction" })
  deleteReaction(
    @User("id") userId: string,
    @Param("reactionId", ParseUUIDPipe) reactionId: string,
  ) {
    return this.feedbackService.deleteReaction(userId, reactionId);
  }
}
